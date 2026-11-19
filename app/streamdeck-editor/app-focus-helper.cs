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
 static readonly HashSet<IntPtr> excluded=new HashSet<IntPtr>();
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
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int infoClass,out int elevation,int length,out int size);
 static bool? Elevated(IntPtr process){
   IntPtr token;
   if(!OpenProcessToken(process,8,out token))return null;
   try{int elevation,size;return GetTokenInformation(token,20,out elevation,4,out size)?(bool?)(elevation!=0):null;}
   finally{CloseHandle(token);}
 }
 static bool TerminalId(string id){
   return Same(id,"Microsoft.WindowsTerminal_8wekyb3d8bbwe!App")||Same(id,"Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe!App");
 }
 static bool TerminalIdentity(Identity identity,string windowId){
   return TerminalId(identity.Id)||TerminalId(windowId)||
     (!String.IsNullOrEmpty(identity.Path)&&Same(Path.GetFileName(identity.Path),"WindowsTerminal.exe"));
 }
 static bool unknownTerminal;
 sealed class Identity {public string Path,Id;public bool? IsElevated;}
 static Identity ProcessIdentity(uint pid,Dictionary<uint,Identity> cache){
   Identity result;if(cache.TryGetValue(pid,out result))return result;
   result=new Identity();cache[pid]=result;
   IntPtr process=OpenProcess(0x1000,false,pid);if(process==IntPtr.Zero)return result;
   try{
     uint len=32768;var text=new StringBuilder((int)len);
     if(QueryFullProcessImageName(process,0,text,ref len))result.Path=text.ToString();
     if(kind=="Terminal")result.IsElevated=Elevated(process);
     if(kind=="AppID"||kind=="Terminal"){
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
   if(kind=="Terminal"){
     if(!TerminalIdentity(identity,WindowId(hwnd)))return null;
     if(!identity.IsElevated.HasValue){unknownTerminal=true;Note("terminal-token-unavailable="+pid);return null;}
     return identity.IsElevated.Value==(target=="admin")?"terminal-"+target:null;
   }
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
   unknownTerminal=false;
   var rows=new List<Candidate>();var cache=new Dictionary<uint,Identity>();
   if(!EnumWindows((hwnd,unused)=>{
     try{
       if(!Eligible(hwnd)||excluded.Contains(hwnd))return true;
       string match=Match(hwnd,cache);
       if(match!=null)rows.Add(new Candidate{Hwnd=hwnd,Reason=match});
     }catch(Exception e){Note("enumeration: "+e.GetType().Name);}
     return true;
   },IntPtr.Zero))throw new Exception("EnumWindows failed");
   if(kind=="Terminal"&&rows.Count==0&&unknownTerminal)throw new Exception("터미널 권한을 확인할 수 없습니다. 중복 실행하지 않았습니다.");
   IntPtr foreground=DFFolderNative.GetForegroundWindow();
   rows.Sort((a,b)=>(b.Hwnd==foreground?2:Cloaked(b.Hwnd)?0:1).CompareTo(a.Hwnd==foreground?2:Cloaked(a.Hwnd)?0:1));
   return rows;
 }
 static bool Fresh(IntPtr hwnd){return Eligible(hwnd)&&Match(hwnd,new Dictionary<uint,Identity>())!=null;}
 static bool WaitForeground(IntPtr hwnd){
   for(int i=0;i<10&&DFFolderNative.GetForegroundWindow()!=hwnd;i++)Thread.Sleep(30);
   return DFFolderNative.GetForegroundWindow()==hwnd&&!DFFolderNative.IsIconic(hwnd)&&Fresh(hwnd);
 }
 // Terminal-specific fallback: adapt the official IslandWindow summon sequence
 // to an external HWND, additionally joining the target's input queue.
 // Never send commands to the shell or create another Terminal/tab.
 [DllImport("user32.dll",SetLastError=true)]static extern IntPtr SetActiveWindow(IntPtr hwnd);
 [DllImport("user32.dll",SetLastError=true)]static extern bool SetWindowPos(IntPtr hwnd,IntPtr insertAfter,int x,int y,int cx,int cy,uint flags);
 [DllImport("user32.dll",SetLastError=true)]static extern IntPtr SendMessageTimeoutW(IntPtr hwnd,uint msg,UIntPtr w,IntPtr l,uint flags,uint timeout,out UIntPtr result);
 static bool Responsive(IntPtr hwnd){
   UIntPtr result;
   return hwnd!=IntPtr.Zero&&SendMessageTimeoutW(hwnd,0,UIntPtr.Zero,IntPtr.Zero,0x23,300,out result)!=IntPtr.Zero;
 }
 static bool TerminalAttachedFocus(IntPtr hwnd){
   if(!Fresh(hwnd)||Cloaked(hwnd))return false;
   IntPtr foreground=DFFolderNative.GetForegroundWindow();
   if(foreground==hwnd)return WaitForeground(hwnd);
   if(!Responsive(foreground)||!Responsive(hwnd)){Note("terminal-fallback-unresponsive");return false;}
   uint pid,foregroundPid;
   uint current=DFFolderNative.GetCurrentThreadId();
   uint foregroundThread=DFFolderNative.GetWindowThreadProcessId(foreground,out foregroundPid);
   uint targetThread=DFFolderNative.GetWindowThreadProcessId(hwnd,out pid);
   if(foregroundThread==0||targetThread==0||!Fresh(hwnd)||DFFolderNative.GetForegroundWindow()!=foreground)return false;
   bool joinedForeground=false,joinedTarget=false;
   try{
     if(foregroundThread!=current){
       joinedForeground=DFFolderNative.AttachThreadInput(current,foregroundThread,true);
       Note("terminal-attach-foreground="+joinedForeground+" error="+(joinedForeground?0:Marshal.GetLastWin32Error()));
       if(!joinedForeground)return false;
     }
     if(targetThread!=current&&targetThread!=foregroundThread){
       joinedTarget=DFFolderNative.AttachThreadInput(current,targetThread,true);
       Note("terminal-attach-target="+joinedTarget+" error="+(joinedTarget?0:Marshal.GetLastWin32Error()));
       if(!joinedTarget)return false;
     }
     if(!Fresh(hwnd))return false;
     IntPtr activeBefore=DFFolderNative.GetForegroundWindow();
     if(activeBefore!=foreground&&activeBefore!=hwnd)return false;
     // Non-topmost Z-order only; preserve size, position, maximization and tabs.
     bool positioned=SetWindowPos(hwnd,IntPtr.Zero,0,0,0,0,0x0203);
     Note("terminal-position="+positioned+" error="+(positioned?0:Marshal.GetLastWin32Error()));
     IntPtr previous=SetActiveWindow(hwnd);
     Note("terminal-active-previous="+previous.ToInt64()+" error="+(previous!=IntPtr.Zero?0:Marshal.GetLastWin32Error()));
     bool focused=DFFolderNative.SetForegroundWindow(hwnd);
     Note("terminal-set-foreground="+focused);
   }finally{
     if(joinedTarget)Note("terminal-detach-target="+DFFolderNative.AttachThreadInput(current,targetThread,false));
     if(joinedForeground)Note("terminal-detach-foreground="+DFFolderNative.AttachThreadInput(current,foregroundThread,false));
   }
   bool ok=WaitForeground(hwnd);
   Note("terminal-fallback-after="+DFFolderNative.GetForegroundWindow().ToInt64()+" focused="+ok);
   return ok;
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
   if(!ok&&kind=="Terminal")return TerminalAttachedFocus(hwnd);
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
 // A console client can be hosted by another process. Detect exact running
 // executable/AppID without guessing which terminal window owns that client.
 static bool Running(){
   if(kind=="Terminal")return false; // terminal background processes are not open windows
   var cache=new Dictionary<uint,Identity>();
   int session;using(var self=Process.GetCurrentProcess())session=self.SessionId;
   foreach(var process in Process.GetProcesses()){
     using(process)try{
       if(process.SessionId!=session)continue;
       if(kind=="EXE"&&!Same(process.ProcessName,Path.GetFileNameWithoutExtension(target)))continue;
       var identity=ProcessIdentity((uint)process.Id,cache);
       if((kind=="AppID"&&Same(identity.Id,target))||(identity.Path!=null&&paths.Contains(identity.Path))){
         Note("running-pid="+process.Id);return true;
       }
     }catch{}
   }
   return false;
 }
 static string LocateAndFocus(int wait,bool activate=true,bool newOnly=false,bool checkRunning=true){
   var watch=Stopwatch.StartNew();
   do{
     var candidates=Windows();
     if(candidates.Count>0){
       if(!activate)return "present";
       foreach(var candidate in candidates){try{if(Activate(candidate))return "focused";}catch(Exception e){Note("activation: "+e.Message);}}
       return "matched-not-focused";
     }
     if(!activate&&checkRunning&&Running())return "present";
     if(watch.ElapsedMilliseconds>=wait)break;
     Thread.Sleep(150);
   }while(true);
   return !newOnly&&checkRunning&&Running()?"present":"missing";
 }
 static void Snapshot(){
   var handles=new List<string>();
   foreach(var candidate in Windows())handles.Add(candidate.Hwnd.ToInt64().ToString(System.Globalization.CultureInfo.InvariantCulture));
   Console.WriteLine(new JavaScriptSerializer().Serialize(new {status="snapshot",handles=handles,details=notes}));
 }
 static void LaunchTerminal(){
   string alias=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Microsoft","WindowsApps","wt.exe");
   // The only elevated command is the fixed Windows Terminal execution alias.
   // Do not pass a user command or bypass UAC.
   using(var self=Process.GetCurrentProcess()){
     if(target=="normal"&&Elevated(self.Handle)!=false)
       throw new Exception("일반 터미널을 열려면 DeckForge를 일반 권한으로 실행하세요.");
   }
   var info=new ProcessStartInfo(alias,"-w new"){UseShellExecute=true,Verb=target=="admin"?"runas":"open"};
   using(var child=Process.Start(info)){}
   Result("launched");
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
       if(!TerminalId("Microsoft.WindowsTerminal_8wekyb3d8bbwe!App")||TerminalId("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"))throw new Exception("Terminal identity validation failed");
       using(var self=Process.GetCurrentProcess())if(!Elevated(self.Handle).HasValue)throw new Exception("Token elevation validation failed");
       Result("validated");return;
     }
     kind=Environment.GetEnvironmentVariable("DECKFORGE_APP_FOCUS_KIND");
     target=Encoding.Unicode.GetString(Convert.FromBase64String(Environment.GetEnvironmentVariable("DECKFORGE_APP_FOCUS_TARGET")));
     if((mode!="Focus"&&mode!="Wait"&&mode!="Probe"&&mode!="WaitPresent"&&mode!="Snapshot"&&mode!="WaitNew"&&mode!="Launch")||String.IsNullOrWhiteSpace(target)||target.Length>4096)throw new Exception("Invalid focus request");
     if(kind=="EXE"){
       if(!Path.IsPathRooted(target)||!target.EndsWith(".exe",StringComparison.OrdinalIgnoreCase))throw new Exception("Invalid executable");
       paths.Add(target);
     }else if(kind=="AppID"){
       if(target.Length>512||target.IndexOfAny(new[]{'\\','/',':','"'})>=0)throw new Exception("Invalid AppID");
     }else if(kind=="Terminal"){
       if(target!="normal"&&target!="admin")throw new Exception("Invalid terminal kind");
     }else throw new Exception("Invalid focus kind");
     if(mode=="Launch"){
       if(kind!="Terminal")throw new Exception("Invalid launch kind");
       LaunchTerminal();return;
     }
     bool activate=mode!="Probe"&&mode!="WaitPresent";
     bool newOnly=mode=="WaitNew";
     if(newOnly){
       foreach(string raw in (Environment.GetEnvironmentVariable("DECKFORGE_APP_FOCUS_EXCLUDE")??"").Split(',')){
         long value;if(Int64.TryParse(raw,out value))excluded.Add(new IntPtr(value));
       }
     }
     if(mode=="Snapshot"){
       if(kind=="AppID"&&target.IndexOf('!')<0)ResolveShortcutPaths();
       Snapshot();return;
     }
     // Check existing windows before considering a process without a visible window.
     string status=LocateAndFocus(0,activate,newOnly,false);
     if(status=="missing"&&kind=="AppID"&&target.IndexOf('!')<0){
       ResolveShortcutPaths();if(paths.Count>0)status=LocateAndFocus(0,activate,newOnly,false);
     }
     if(status=="missing"){
       int wait=(mode=="Wait"||mode=="WaitPresent"||newOnly)?5500:0;
       status=LocateAndFocus(wait,activate,newOnly,!newOnly);
     }
     Result(status);
   }catch(Exception e){Result("error",e.Message);}
 }
}
