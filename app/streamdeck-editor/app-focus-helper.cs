using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

[StructLayout(LayoutKind.Sequential, Pack=4)] struct DFAppKey {public Guid fmtid;public uint pid;}
[StructLayout(LayoutKind.Explicit,Size=24)] struct DFAppVariant {[FieldOffset(0)]public ushort vt;[FieldOffset(8)]public IntPtr ptr;}
[ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface DFAppStore {
 [PreserveSig]int GetCount(out uint count);
 [PreserveSig]int GetAt(uint index,out DFAppKey key);
 [PreserveSig]int GetValue(ref DFAppKey key,out DFAppVariant value);
}
static class DFAppFocus {
 delegate bool EnumProc(IntPtr hwnd,IntPtr data);
 [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc cb,IntPtr data);
 [DllImport("user32.dll")]static extern bool EnumChildWindows(IntPtr hwnd,EnumProc cb,IntPtr data);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")]static extern IntPtr GetWindow(IntPtr hwnd,uint command);
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]static extern IntPtr GetWindowLongPtr(IntPtr hwnd,int index);
 [DllImport("dwmapi.dll")]static extern int DwmGetWindowAttribute(IntPtr hwnd,uint attr,out int value,int size);
 [DllImport("kernel32.dll")]static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder text,ref uint size);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern int GetApplicationUserModelId(IntPtr process,ref uint size,StringBuilder text);
 [DllImport("shell32.dll")]static extern int SHGetPropertyStoreForWindow(IntPtr hwnd,ref Guid iid,out DFAppStore store);
 [DllImport("ole32.dll")]static extern int PropVariantClear(ref DFAppVariant value);
 static readonly List<string> notes=new List<string>();
 static readonly HashSet<string> paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
 static string kind,target;
 static void Note(string s){if(notes.Count<100)notes.Add(s);}
 static void Result(string status,string error=null) {
   Console.WriteLine(new JavaScriptSerializer().Serialize(new {status=status,error=error,details=notes}));
 }
 static bool Same(string a,string b){return !String.IsNullOrEmpty(a)&&String.Equals(a,b,StringComparison.OrdinalIgnoreCase);}
 static void Release(object o){if(o!=null&&Marshal.IsComObject(o))Marshal.ReleaseComObject(o);}
 static string WindowId(IntPtr hwnd){
   DFAppStore store=null;DFAppVariant value=new DFAppVariant();
   try {
     Guid iid=typeof(DFAppStore).GUID;
     if(SHGetPropertyStoreForWindow(hwnd,ref iid,out store)<0||store==null)return null;
     DFAppKey key=new DFAppKey{fmtid=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),pid=5};
     if(store.GetValue(ref key,out value)<0||value.ptr==IntPtr.Zero)return null;
     return value.vt==31?Marshal.PtrToStringUni(value.ptr):value.vt==8?Marshal.PtrToStringBSTR(value.ptr):null;
   }catch{return null;}
   finally{PropVariantClear(ref value);Release(store);}
 }
 sealed class Identity {public string Path,Id;}
 static Identity ProcessIdentity(uint pid,Dictionary<uint,Identity> cache){
   Identity result;if(cache.TryGetValue(pid,out result))return result;
   result=new Identity();cache[pid]=result;
   IntPtr process=OpenProcess(0x1000,false,pid);if(process==IntPtr.Zero)return result;
   try{
     uint len=32768;var text=new StringBuilder((int)len);
     if(QueryFullProcessImageName(process,0,text,ref len))result.Path=text.ToString();
     if(kind=="AppID"){
       len=0;if(GetApplicationUserModelId(process,ref len,null)==122&&len>0&&len<=32768){
         text=new StringBuilder((int)len);
         if(GetApplicationUserModelId(process,ref len,text)==0)result.Id=text.ToString();
       }
     }
   }finally{CloseHandle(process);}
   return result;
 }
 static string DirectMatch(IntPtr hwnd,Dictionary<uint,Identity> cache){
   if(kind=="AppID"&&Same(WindowId(hwnd),target))return "window-appid";
   uint pid;DFFolderNative.GetWindowThreadProcessId(hwnd,out pid);if(pid==0)return null;
   var identity=ProcessIdentity(pid,cache);
   if(kind=="AppID"&&Same(identity.Id,target))return "process-appid";
   if(identity.Path!=null&&paths.Contains(identity.Path))return "exe-path";
   return null;
 }
 static string Match(IntPtr hwnd,Dictionary<uint,Identity> cache){
   string match=DirectMatch(hwnd,cache);if(match!=null)return match;
   if(kind!="AppID")return null;
   // Packaged applications can be hosted by a different top-level process.
   EnumChildWindows(hwnd,(child,unused)=>{
     match=DirectMatch(child,cache);
     return match==null;
   },IntPtr.Zero);
   return match==null?null:"child-"+match;
 }
 static bool Cloaked(IntPtr hwnd){int v;return DwmGetWindowAttribute(hwnd,14,out v,4)==0&&v!=0;}
 static bool Eligible(IntPtr hwnd){
   if(!DFFolderNative.IsWindow(hwnd)||!IsWindowVisible(hwnd))return false;
   long flags=GetWindowLongPtr(hwnd,-20).ToInt64();
   bool tool=(flags&0x80)!=0,app=(flags&0x40000)!=0;
   return (!tool||app)&&(flags&0x08000000)==0;
 }
 sealed class Candidate {public IntPtr Hwnd;public string Reason;}
 static List<Candidate> Windows(){
   var rows=new List<Candidate>();var cache=new Dictionary<uint,Identity>();
   if(!EnumWindows((hwnd,unused)=>{
     try{
       if(!Eligible(hwnd))return true;
       string match=Match(hwnd,cache);
       if(match!=null)rows.Add(new Candidate{Hwnd=hwnd,Reason=match});
     }catch(Exception e){Note("enumeration: "+e.GetType().Name);}
     return true;
   },IntPtr.Zero))throw new Exception("EnumWindows failed");
   IntPtr foreground=DFFolderNative.GetForegroundWindow();
   rows.Sort((a,b)=>(b.Hwnd==foreground?2:Cloaked(b.Hwnd)?0:1).CompareTo(a.Hwnd==foreground?2:Cloaked(a.Hwnd)?0:1));
   return rows;
 }
 static bool Fresh(IntPtr hwnd){return Eligible(hwnd)&&Match(hwnd,new Dictionary<uint,Identity>())!=null;}
 static bool WaitForeground(IntPtr hwnd){
   for(int i=0;i<10&&DFFolderNative.GetForegroundWindow()!=hwnd;i++)Thread.Sleep(30);
   return DFFolderNative.GetForegroundWindow()==hwnd&&!DFFolderNative.IsIconic(hwnd)&&Fresh(hwnd);
 }
 static bool Activate(Candidate candidate){
   IntPtr hwnd=candidate.Hwnd;
   Note("window="+hwnd.ToInt64()+" "+candidate.Reason+" before="+DFFolderNative.GetForegroundWindow().ToInt64());
   if(!Fresh(hwnd)||Cloaked(hwnd))return false;
   if(DFFolderNative.IsIconic(hwnd)){
     Note("restore="+DFFolderNative.ShowWindowAsync(hwnd,9));
     for(int i=0;i<15&&DFFolderNative.IsIconic(hwnd);i++)Thread.Sleep(40);
     if(DFFolderNative.IsIconic(hwnd))return false;
   }
   if(!Fresh(hwnd))return false;
   if(DFFolderNative.GetForegroundWindow()!=hwnd)Note("setForeground="+DFFolderNative.SetForegroundWindow(hwnd));
   if(WaitForeground(hwnd))return true;
   if(!Fresh(hwnd))return false;
   foreach(string item in DFFolderNative.AttachedFocus(hwnd))Note(item);
   bool ok=WaitForeground(hwnd);
   Note("after="+DFFolderNative.GetForegroundWindow().ToInt64()+" focused="+ok);
   return ok;
 }
 static bool SafeShortcutExe(string path){
   if(String.IsNullOrEmpty(path)||!Path.IsPathRooted(path)||!path.EndsWith(".exe",StringComparison.OrdinalIgnoreCase))return false;
   // Never infer a classic app from a shared interpreter or host executable.
   string n=Path.GetFileName(path).ToLowerInvariant();
   return Array.IndexOf(new[]{"explorer.exe","cmd.exe","powershell.exe","pwsh.exe","rundll32.exe","dllhost.exe","wscript.exe","cscript.exe","mshta.exe","applicationframehost.exe","svchost.exe","conhost.exe","wt.exe"},n)<0;
 }
 static IEnumerable<string> Shortcuts(string root){
   var queue=new Queue<string>();if(Directory.Exists(root))queue.Enqueue(root);
   int dirs=0,files=0;
   while(queue.Count>0&&dirs++<1000&&files<5000){
     string dir=queue.Dequeue();string[] links=new string[0],sub=new string[0];
     try{links=Directory.GetFiles(dir,"*.lnk");sub=Directory.GetDirectories(dir);}catch{}
     foreach(string link in links){if(files++>=5000)yield break;yield return link;}
     foreach(string child in sub){try{if((File.GetAttributes(child)&FileAttributes.ReparsePoint)==0)queue.Enqueue(child);}catch{}}
   }
 }
 static void ResolveShortcutPaths(){
   if(kind!="AppID"||target.IndexOf('!')>=0)return;
   object shell=null,wsh=null;
   try{
     shell=Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application"));
     wsh=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
     foreach(string root in new[]{Environment.GetFolderPath(Environment.SpecialFolder.Programs),Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms)}){
       foreach(string link in Shortcuts(root)){
         object folder=null,item=null,shortcut=null;
         try{
           folder=((dynamic)shell).NameSpace(Path.GetDirectoryName(link));if(folder==null)continue;
           item=((dynamic)folder).ParseName(Path.GetFileName(link));if(item==null)continue;
           object id=((dynamic)item).ExtendedProperty("System.AppUserModel.ID");
           if(!Same(Convert.ToString(id),target))continue;
           shortcut=((dynamic)wsh).CreateShortcut(link);
           string exe=Convert.ToString(((dynamic)shortcut).TargetPath);
           if(SafeShortcutExe(exe)){paths.Add(exe);Note("shortcut="+exe);}
         }catch{}finally{Release(shortcut);Release(item);Release(folder);}
       }
     }
   }catch(Exception e){Note("shortcut lookup: "+e.GetType().Name);}
   finally{Release(wsh);Release(shell);}
 }
 static string LocateAndFocus(int wait){
   var watch=Stopwatch.StartNew();bool matched=false;
   do{
     var candidates=Windows();
     if(candidates.Count>0){
       matched=true;
       foreach(var candidate in candidates){try{if(Activate(candidate))return "focused";}catch(Exception e){Note("activation: "+e.Message);}}
       // An existing window is not a reason to start another process.
       return "matched-not-focused";
     }
     if(watch.ElapsedMilliseconds>=wait)break;
     Thread.Sleep(150);
   }while(true);
   return matched?"matched-not-focused":"missing";
 }
 [STAThread]public static void Main(){
   Console.OutputEncoding=new UTF8Encoding(false);
   try{
     string mode=Environment.GetEnvironmentVariable("DECKFORGE_APP_FOCUS_MODE");
     if(mode=="Validate"){
       if(!Same("a","A")||SafeShortcutExe(@"C:\Windows\explorer.exe")||!SafeShortcutExe(@"C:\Tools\app.exe")||Marshal.SizeOf(typeof(DFAppVariant))!=24)
         throw new Exception("App focus validation failed");
       kind="EXE";target=@"Z:\DeckForge-Nonexistent-"+Guid.NewGuid().ToString()+".exe";paths.Add(target);
       if(LocateAndFocus(0)!="missing")throw new Exception("Unexpected window match");
       Result("validated");return;
     }
     kind=Environment.GetEnvironmentVariable("DECKFORGE_APP_FOCUS_KIND");
     target=Encoding.Unicode.GetString(Convert.FromBase64String(Environment.GetEnvironmentVariable("DECKFORGE_APP_FOCUS_TARGET")));
     if((mode!="Focus"&&mode!="Wait")||String.IsNullOrWhiteSpace(target)||target.Length>4096)throw new Exception("Invalid focus request");
     if(kind=="EXE"){
       if(!Path.IsPathRooted(target)||!target.EndsWith(".exe",StringComparison.OrdinalIgnoreCase))throw new Exception("Invalid executable");
       paths.Add(target);
     }else if(kind=="AppID"){
       if(target.Length>512||target.IndexOfAny(new[]{'\\','/',':','"'})>=0)throw new Exception("Invalid AppID");
     }else throw new Exception("Invalid focus kind");
     // Check exact window/process AppID first. Resolve classic shortcut targets only if necessary.
     string status=LocateAndFocus(0);
     if(status=="missing"&&kind=="AppID"&&target.IndexOf('!')<0){
       ResolveShortcutPaths();if(paths.Count>0)status=LocateAndFocus(0);
     }
     if(status=="missing"&&mode=="Wait")status=LocateAndFocus(5500);
     Result(status);
   }catch(Exception e){Result("error",e.Message);}
 }
}
