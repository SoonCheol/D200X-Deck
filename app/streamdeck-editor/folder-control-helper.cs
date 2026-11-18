using System;
using System.Text;
using System.Runtime.InteropServices;
[ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface DFFolderService {
  [PreserveSig] int QueryService(ref Guid service,ref Guid iid,out IntPtr result);
}
[ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface DFFolderBrowser {
  [PreserveSig] int GetWindow(out IntPtr hwnd);
  [PreserveSig] int ContextSensitiveHelp([MarshalAs(UnmanagedType.Bool)] bool enter);
}
public static class DFFolderNative {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd,int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll",SetLastError=true)] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG msg,IntPtr hwnd,uint min,uint max,uint remove);
  [StructLayout(LayoutKind.Sequential)] struct MSG {public IntPtr hwnd;public uint msg;public UIntPtr w;public IntPtr l;public uint time;public int x,y;public uint priv;}
  public static string[] AttachedFocus(IntPtr target) {
    MSG msg;PeekMessage(out msg,IntPtr.Zero,0,0,0);
    uint pid;uint current=GetCurrentThreadId();uint other=GetWindowThreadProcessId(GetForegroundWindow(),out pid);
    bool attached=false,top=false,focus=false,detached=true;int error=0;
    try {
      if(other!=0&&other!=current){attached=AttachThreadInput(current,other,true);if(!attached)error=Marshal.GetLastWin32Error();}
      if(IsWindow(target)){top=BringWindowToTop(target);focus=SetForegroundWindow(target);}
    } finally {if(attached)detached=AttachThreadInput(current,other,false);}
    return new[]{"attached="+attached,"attachError="+error,"bringToTop="+top,"setForeground="+focus,"detached="+detached};
  }
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after,string cls,string name);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,StringBuilder name,int length);
  [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint message,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
  [DllImport("shell32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr ShellExecute(IntPtr hwnd,string verb,string file,string args,string directory,int show);
  public static string ClassName(IntPtr hwnd) {
    var name=new StringBuilder(256);GetClassName(hwnd,name,name.Capacity);return name.ToString();
  }
  public static IntPtr TabHandle(object browser) {
    var service=typeof(DFFolderBrowser).GUID;var iid=service;IntPtr ptr;
    var provider=browser as DFFolderService;
    if(provider==null||provider.QueryService(ref service,ref iid,out ptr)!=0||ptr==IntPtr.Zero)return IntPtr.Zero;
    try {
      var view=(DFFolderBrowser)Marshal.GetObjectForIUnknown(ptr);
      try {IntPtr hwnd;return view.GetWindow(out hwnd)==0?hwnd:IntPtr.Zero;}
      finally {Marshal.ReleaseComObject(view);}
    } finally {Marshal.Release(ptr);}
  }
  public static IntPtr ActiveTab(IntPtr frame) {
    return FindWindowEx(frame,IntPtr.Zero,"ShellTabWindowClass",null);
  }
  public static int TabCount(IntPtr frame) {
    int count=0;IntPtr tab=IntPtr.Zero;
    while(count<64&&(tab=FindWindowEx(frame,tab,"ShellTabWindowClass",null))!=IntPtr.Zero)count++;
    return count;
  }
  // Explorer's undocumented tab-index command; never assume child z-order equals tab order.
  public static bool SelectIndex(IntPtr frame,int index) {
    IntPtr ignored;
    return SendMessageTimeout(frame,0x111,(IntPtr)0xA221,(IntPtr)index,2,250,out ignored)!=IntPtr.Zero;
  }
}

public static class FolderHelper {
  static readonly System.Collections.Generic.List<string> details=new System.Collections.Generic.List<string>();
  static string mode;
  static void Note(string s){if(details.Count<160)details.Add(s);}
  static void Result(string status,string reason=""){
    var json=new System.Web.Script.Serialization.JavaScriptSerializer();
    Console.Write(json.Serialize(new {status=status,reason=reason,mode=mode,details=details.ToArray()}));
  }
  static string Norm(string s){
    if(string.IsNullOrWhiteSpace(s)||!System.Text.RegularExpressions.Regex.IsMatch(s,@"^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)"))return null;
    try{return System.IO.Path.GetFullPath(s).TrimEnd('\\','/');}catch{return null;}
  }
  static bool Same(string a,string b){string x=Norm(a),y=Norm(b);return x!=null&&y!=null&&string.Equals(x,y,StringComparison.OrdinalIgnoreCase);}
  static void Release(object o){if(o!=null&&Marshal.IsComObject(o))Marshal.ReleaseComObject(o);}
  static bool Match(dynamic browser,string target){
    string folder=null,url=null;object doc=null,f=null,self=null;
    try{doc=browser.Document;f=((dynamic)doc).Folder;self=((dynamic)f).Self;folder=(string)((dynamic)self).Path;}catch(Exception e){Note("path-error="+e.GetType().Name);}
    finally{Release(self);Release(f);Release(doc);}
    if(Norm(folder)!=null)return Same(folder,target);
    try{Uri u;if(Uri.TryCreate((string)browser.LocationURL,UriKind.Absolute,out u)&&u.IsFile)url=u.LocalPath;}catch{}
    return Same(url,target);
  }
  sealed class Row{public object Browser;public IntPtr Frame,Tab;public bool Match,Active,Foreground;}
  static System.Collections.Generic.List<Row> Rows(string target){
    var rows=new System.Collections.Generic.List<Row>();object shell=null,windows=null;
    try{
      shell=Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application"));
      windows=((dynamic)shell).Windows();int n=(int)((dynamic)windows).Count;
      for(int i=0;i<n;i++){object b=null;
        try{
          b=((dynamic)windows).Item(i);if(b==null)continue;
          var frame=new IntPtr(Convert.ToInt64(((dynamic)b).HWND));
          if(DFFolderNative.ClassName(frame)!="CabinetWClass")continue;
          var tab=IntPtr.Zero;try{tab=DFFolderNative.TabHandle(b);}catch(Exception e){Note("tab-error="+e.GetType().Name);}
          var active=DFFolderNative.ActiveTab(frame);
          rows.Add(new Row{Browser=b,Frame=frame,Tab=tab,Match=Match((dynamic)b,target),Active=active==IntPtr.Zero||(tab!=IntPtr.Zero&&active==tab),Foreground=DFFolderNative.GetForegroundWindow()==frame});b=null;
        }catch(Exception e){Note("enumeration-error="+e.GetType().Name);}finally{Release(b);}
      }
      return rows;
    }catch{Clear(rows);throw;}finally{Release(windows);Release(shell);}
  }
  static void Clear(System.Collections.Generic.List<Row> rows){foreach(var r in rows)Release(r.Browser);}
  static void Sleep(int ms){System.Threading.Thread.Sleep(ms);}
  static bool WaitForeground(IntPtr frame){for(int i=0;i<10&&DFFolderNative.GetForegroundWindow()!=frame;i++)Sleep(30);return DFFolderNative.GetForegroundWindow()==frame;}
  static bool Focus(Row r,string target){
    var frame=r.Frame;var active=DFFolderNative.ActiveTab(frame);
    if(!DFFolderNative.IsWindow(frame)||!Match((dynamic)r.Browser,target))return false;
    if(active!=IntPtr.Zero&&(r.Tab==IntPtr.Zero||DFFolderNative.ClassName(r.Tab)!="ShellTabWindowClass"))return false;
    if(DFFolderNative.IsIconic(frame)){
      Note("restore="+DFFolderNative.ShowWindowAsync(frame,9));
      for(int i=0;i<15&&DFFolderNative.IsIconic(frame);i++)Sleep(40);
      if(DFFolderNative.IsIconic(frame))return false;
    }
    if(active!=IntPtr.Zero&&DFFolderNative.ActiveTab(frame)!=r.Tab){
      int count=Math.Min(32,DFFolderNative.TabCount(frame));
      for(int i=1;i<=count;i++){
        if(!Match((dynamic)r.Browser,target))return false;
        bool selected=DFFolderNative.SelectIndex(frame,i);Note("tabIndex"+i+"="+selected);if(!selected)break;
        for(int j=0;j<5&&DFFolderNative.ActiveTab(frame)!=r.Tab;j++)Sleep(50);
        if(DFFolderNative.ActiveTab(frame)==r.Tab)break;
      }
      if(DFFolderNative.ActiveTab(frame)!=r.Tab)return false;
    }
    if(!Match((dynamic)r.Browser,target))return false;
    if(DFFolderNative.GetForegroundWindow()!=frame)Note("setForeground="+DFFolderNative.SetForegroundWindow(frame));
    if(!WaitForeground(frame)){
      if(!Match((dynamic)r.Browser,target)||(active!=IntPtr.Zero&&DFFolderNative.ActiveTab(frame)!=r.Tab))return false;
      foreach(string detail in DFFolderNative.AttachedFocus(frame))Note(detail);WaitForeground(frame);
    }
    Note("afterForeground="+DFFolderNative.GetForegroundWindow().ToInt64());
    return DFFolderNative.GetForegroundWindow()==frame&&!DFFolderNative.IsIconic(frame)&&Match((dynamic)r.Browser,target)&&(active==IntPtr.Zero||DFFolderNative.ActiveTab(frame)==r.Tab);
  }
  delegate bool EnumProc(IntPtr hwnd,IntPtr data);
  [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc cb,IntPtr data);
  static System.Collections.Generic.HashSet<IntPtr> Frames(){
    var set=new System.Collections.Generic.HashSet<IntPtr>();
    if(!EnumWindows((h,d)=>{if(DFFolderNative.ClassName(h)=="CabinetWClass")set.Add(h);return true;},IntPtr.Zero))throw new Exception("EnumWindows failed");
    return set;
  }
  static void OpenNew(string target){
    var before=Frames();
    string arg=System.IO.Path.GetFullPath(target);
    if(arg.Length!=3||arg[1]!=':')arg=arg.TrimEnd('\\','/');
    if(arg.Contains("\""))throw new Exception("Invalid folder path");
    // Explorer parses /n,<path> itself. Quote only whitespace/comma paths.
    if(System.Text.RegularExpressions.Regex.IsMatch(arg,@"[\s,]"))arg="\""+arg+"\"";
    var info=new System.Diagnostics.ProcessStartInfo(System.IO.Path.Combine(Environment.GetEnvironmentVariable("SystemRoot"),"explorer.exe"),"/n,"+arg);
    info.UseShellExecute=false;
    using(var p=System.Diagnostics.Process.Start(info)){if(p==null)throw new Exception("Explorer launch failed");}
    Note("explorer.exe /n requested");
    for(int i=0;i<16;i++){
      Sleep(250);var rows=Rows(target);
      try{foreach(var row in rows)if(row.Match&&!before.Contains(row.Frame)){
        Note("newMatchingFrame="+row.Frame.ToInt64());
        bool focused=false;try{focused=Focus(row,target);}catch(Exception e){Note("new-focus-error="+e.Message);}
        Note("newForeground="+focused);Result("opened");return;
      }}finally{Clear(rows);}
    }
    Result("new-not-confirmed","No new matching Explorer frame observed after request");
  }
  [STAThread]public static void Main(){
    Console.OutputEncoding=new UTF8Encoding(false);
    mode=Environment.GetEnvironmentVariable("DECKFORGE_FOLDER_MODE");
    try{
      if(mode=="Validate"){
        if(!Same(@"C:\","c:/")||!Same(@"\\server\share\folder\",@"\\SERVER\SHARE\folder")||Same(@"C:\a",@"C:\ab")||Same(@"C:\a","a"))throw new Exception("Folder path comparison test failed");
        Result("validated");return;
      }
      string target=Encoding.Unicode.GetString(Convert.FromBase64String(Environment.GetEnvironmentVariable("DECKFORGE_FOLDER_TARGET")));
      if(Norm(target)==null)throw new Exception("Invalid absolute folder path");
      if(mode=="New"){OpenNew(target);return;}
      if(mode!="Focus")throw new Exception("Invalid folder mode");
      var rows=Rows(target);
      try{
        Note("beforeForeground="+DFFolderNative.GetForegroundWindow().ToInt64());
        foreach(var row in rows)Note("before frame="+row.Frame.ToInt64()+" tab="+row.Tab.ToInt64()+" match="+row.Match+" active="+row.Active+" foreground="+row.Foreground);
        var matching=rows.FindAll(r=>r.Match);
        if(matching.Count==0){Result("missing");return;}
        matching.Sort((a,b)=>((b.Active?1:0)+(b.Active&&b.Foreground?2:0)).CompareTo((a.Active?1:0)+(a.Active&&a.Foreground?2:0)));
        foreach(var row in matching){try{if(Focus(row,target)){Result("focused");return;}}catch(Exception e){Note("candidate-error="+e.Message);}}
        Result("matched-not-focused");
      }finally{Clear(rows);}
    }catch(Exception e){Result("error",e.Message);}
  }
}
