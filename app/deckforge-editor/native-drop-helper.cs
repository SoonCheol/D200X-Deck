using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using ComData = System.Runtime.InteropServices.ComTypes.IDataObject;

namespace DeckForgeNativeDrop {
  // Separate transient HWND, never replaces Chromium's OLE target.
  static class OverlayNative {
    [DllImport("user32.dll")] internal static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] internal static extern bool SetProcessDPIAware();
    [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW")] internal static extern IntPtr SetWindowLongPtr(IntPtr hwnd,int index,IntPtr value);
    [DllImport("user32.dll")] internal static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int w,int h,uint flags);
    [DllImport("user32.dll")] internal static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern bool GetCursorPos(out PointL point);
    [DllImport("user32.dll")] internal static extern short GetAsyncKeyState(int key);
    [DllImport("shell32.dll",ExactSpelling=true)] internal static extern int SHGetKnownFolderPath(ref Guid id,uint flags,IntPtr token,out IntPtr result);
  }
  static class ResolveDrop {
    static readonly Regex Known=new Regex(@"^(\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\})\\(.+)$");
    static readonly Regex BadPart=new Regex("[\\x00-\\x1f\\x7f/:*?\"<>|]");
    static readonly Regex BadId=new Regex("[\\x00-\\x1f\\x7f\\\\/:\"]");
    static string GetString(Dictionary<string,object> values,string key) {
      object value; return values!=null && values.TryGetValue(key,out value)?value as string:null;
    }
    internal static string KnownPath(string value) {
      if(String.IsNullOrEmpty(value)||value.Length>4096)return null;
      var m=Known.Match(value);if(!m.Success)return null;
      string relative=m.Groups[2].Value;
      foreach(string part in relative.Split('\\')) {
        if(part.Length==0||part=="."||part==".."||part.EndsWith(".")||part.EndsWith(" ")||BadPart.IsMatch(part))return null;
      }
      Guid id=new Guid(m.Groups[1].Value);IntPtr ptr=IntPtr.Zero;
      try {
        if(OverlayNative.SHGetKnownFolderPath(ref id,0,IntPtr.Zero,out ptr)<0||ptr==IntPtr.Zero)return null;
        string root=Marshal.PtrToStringUni(ptr);
        if(String.IsNullOrEmpty(root)||!Path.IsPathRooted(root))return null;
        return Path.Combine(root,relative);
      } finally {if(ptr!=IntPtr.Zero)Marshal.FreeCoTaskMem(ptr);}
    }
    static bool IsAbsolute(string value) {
      return value!=null && (Regex.IsMatch(value,@"^[A-Za-z]:\\") || value.StartsWith(@"\\",StringComparison.Ordinal));
    }
    static object PathCandidate(string value,string name) {
      if(String.IsNullOrEmpty(value)||value.Length>4096)return null;
      string path=value.StartsWith("{",StringComparison.Ordinal)?KnownPath(value):value;
      if(!IsAbsolute(path))return null;
      if(Directory.Exists(path))return new {kind="path",value=path,name=name};
      if(!File.Exists(path))return null;
      string ext=Path.GetExtension(path).ToLowerInvariant();
      return ext==".exe"||ext==".lnk"||ext==".bat"||ext==".cmd" ? new {kind="path",value=path,name=name}:null;
    }
    internal static object FromValues(string file,string parsing,string appId,string hdrop,string name) {
      var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
      foreach(string value in new[]{file,parsing,appId,hdrop}) {
        if(!String.IsNullOrEmpty(value)&&seen.Add(value)){
          object found=PathCandidate(value,name);if(found!=null)return found;
        }
      }
      if(!String.IsNullOrWhiteSpace(appId)&&appId.Length<=512&&!BadId.IsMatch(appId)&&appId!="."&&appId!=".."&&!appId.StartsWith("{"))
        return new {kind="appid",value=appId,name=name};
      return null;
    }
    internal static object FromReport(Dictionary<string,object> report) {
      var items=report["shellItems"] as List<object>;
      object fd;report.TryGetValue("fileDrop",out fd);var files=fd as List<object>;
      object count; if(report.TryGetValue("itemCount",out count)&&Convert.ToUInt32(count)>1)return null;
      if((items!=null&&items.Count>1)||(files!=null&&files.Count>1))return null;
      var item=items!=null&&items.Count==1?items[0] as Dictionary<string,object>:null;
      string hdrop=files!=null&&files.Count==1?(string)files[0].GetType().GetProperty("path").GetValue(files[0],null):null;
      return FromValues(GetString(item,"fileSystemPath"),GetString(item,"parsingName"),GetString(item,"appId"),hdrop,GetString(item,"name"));
    }
    internal static void SelfTest() {
      Inspect.SelfTest();
      string exe=typeof(ResolveDrop).Assembly.Location;
      if(FromValues(exe,null,null,null,null)==null || FromValues(null,null,"net.cozic.joplin-desktop",null,null)==null ||
         FromValues(null,null,"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",null,null)==null ||
         FromValues(null,null,"{6D809377-6AF0-444B-8957-A3773F02200E}\\..\\app.exe",null,null)!=null)
        throw new Exception("Native candidate normalization failed");
      string root=Environment.GetEnvironmentVariable("ProgramW6432")??Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
      string actual=KnownPath("{6D809377-6AF0-444B-8957-A3773F02200E}\\DeckForge-test.exe");
      if(!String.Equals(actual,Path.Combine(root,"DeckForge-test.exe"),StringComparison.OrdinalIgnoreCase))
        throw new Exception("Known folder resolution failed");
    }
  }
  public class SlotRect {
    public int index {get;set;} public int x {get;set;} public int y {get;set;} public int width {get;set;} public int height {get;set;}
    internal Rectangle Bounds {get{return new Rectangle(x,y,width,height);}}
  }
  public class Command {
    public string type {get;set;} public string id {get;set;} public string owner {get;set;} public SlotRect[] rects {get;set;}
  }
  [ComVisible(true),ClassInterface(ClassInterfaceType.None)]
  public sealed class OverlayTarget : INativeDropTarget {
    readonly OverlayForm form;
    internal OverlayTarget(OverlayForm value){form=value;}
    static uint Choose(uint allowed){return (allowed&4)!=0?4u:(allowed&1)!=0?1u:0u;}
    public int DragEnter(ComData data,uint keys,PointL pt,ref uint effect){form.Entered();effect=Choose(effect);return 0;}
    public int DragOver(uint keys,PointL pt,ref uint effect){effect=Choose(effect);return 0;}
    public int DragLeave(){form.Left();return 0;}
    public int Drop(ComData data,uint keys,PointL pt,ref uint effect){
      uint allowed=effect;effect=0;
      if(form.Accept(data,pt,allowed))effect=Choose(allowed);
      return 0;
    }
  }
  sealed class OverlayForm : Form {
    readonly OverlayTarget target;
    readonly JavaScriptSerializer json;
    readonly System.Windows.Forms.Timer handoff=new System.Windows.Forms.Timer {Interval=1200};
    IntPtr registered;
    string active; SlotRect[] slots;
    internal OverlayForm(JavaScriptSerializer serializer) {
      json=serializer;target=new OverlayTarget(this);
      FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;
      BackColor=Color.White;Opacity=0.08;AutoScaleMode=AutoScaleMode.None;
      handoff.Tick+=delegate {handoff.Stop();Finish("end",null);};
    }
    protected override bool ShowWithoutActivation {get{return true;}}
    protected override CreateParams CreateParams {get {var p=base.CreateParams;p.ExStyle|=0x08000000|0x80;return p;}}
    protected override void OnHandleCreated(EventArgs e) {
      base.OnHandleCreated(e);
      Marshal.ThrowExceptionForHR(Native.RegisterDragDrop(Handle,target));registered=Handle;
    }
    protected override void OnHandleDestroyed(EventArgs e) {
      if(registered!=IntPtr.Zero){Native.RevokeDragDrop(registered);registered=IntPtr.Zero;}
      base.OnHandleDestroyed(e);
    }
    internal void Emit(object payload){Console.WriteLine(json.Serialize(payload));Console.Out.Flush();}
    internal void Start(Command cmd) {
      if(active!=null)Finish("end",null);
      if(String.IsNullOrEmpty(cmd.id)||cmd.rects==null||cmd.rects.Length==0||cmd.rects.Length>13)return;
      long ownerValue;
      if(!Int64.TryParse(cmd.owner,out ownerValue)){Emit(new {type="end",id=cmd.id});return;}
      IntPtr owner=new IntPtr(ownerValue);
      if(!OverlayNative.IsWindow(owner)||!OverlayNative.IsWindowVisible(owner)){Emit(new {type="end",id=cmd.id});return;}
      Rectangle bounds=Rectangle.Empty;
      foreach(var s in cmd.rects){
        if(s.index<0||s.index>=13||s.width<1||s.height<1||s.width>4096||s.height>4096){Emit(new {type="end",id=cmd.id});return;}
        bounds=bounds.IsEmpty?s.Bounds:Rectangle.Union(bounds,s.Bounds);
      }
      PointL pointer;
      if(!OverlayNative.GetCursorPos(out pointer)||!bounds.Contains(pointer.x,pointer.y)||
           ((OverlayNative.GetAsyncKeyState(1)&0x8000)==0&&(OverlayNative.GetAsyncKeyState(2)&0x8000)==0)){
        Emit(new {type="end",id=cmd.id});return;
      }
      active=cmd.id;slots=cmd.rects;
      OverlayNative.SetWindowLongPtr(Handle,-8,owner);
      Bounds=bounds;handoff.Start();
      Show();
      if(!OverlayNative.SetWindowPos(Handle,IntPtr.Zero,bounds.X,bounds.Y,bounds.Width,bounds.Height,0x0010|0x0040)){
        Finish("end",null);return;
      }
    }
    internal void Entered(){handoff.Stop();if(active!=null)Emit(new {type="entered",id=active});}
    internal void Left(){string id=active;if(id!=null)BeginInvoke((Action)delegate {if(active==id)Finish("end",null);});}
    internal bool Accept(ComData data,PointL pt,uint allowed){
      string id=active;if(id==null)return false;
      int index=-1;foreach(var s in slots)if(s.Bounds.Contains(pt.x,pt.y)){index=s.index;break;}
      object candidate=null;string error=null;
      try {if(index>=0)candidate=ResolveDrop.FromReport(Inspect.Drop(data,pt,allowed));}
      catch(Exception ex){error=ex.Message;}
      int chosen=index;object value=candidate;string failure=error;
      BeginInvoke((Action)delegate {
        if(active==id)Finish(chosen<0?"end":"result",new {index=chosen,candidate=value,error=failure});
      });
      return index>=0&&candidate!=null;
    }
    internal void Cancel(string id){if(active!=null&&(id==null||id==active))Finish("end",null);}
    void Finish(string type,object result){
      handoff.Stop();string id=active;active=null;slots=null;Hide();
      if(id!=null)Emit(new {type=type,id=id,result=result});
    }
    protected override void Dispose(bool disposing){if(disposing)handoff.Dispose();base.Dispose(disposing);}
  }
  static class IntegrationProgram {
    [STAThread]
    static int Main(string[] args){
      try {if(!OverlayNative.SetProcessDpiAwarenessContext(new IntPtr(-4)))OverlayNative.SetProcessDPIAware();}
      catch(EntryPointNotFoundException){OverlayNative.SetProcessDPIAware();}
      int hr=Native.OleInitialize(IntPtr.Zero);if(hr<0)return 2;
      try {
        if(args.Length==1&&args[0]=="--self-test"){ResolveDrop.SelfTest();return 0;}
        Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        var json=new JavaScriptSerializer {MaxJsonLength=1024*1024};
        using(var form=new OverlayForm(json)){
          IntPtr hwnd=form.Handle;
          var worker=new Thread(delegate(){
            try {
              string line;
              while((line=Console.ReadLine())!=null){
                if(line.Length>32768)continue;
                Command cmd;
                try{cmd=json.Deserialize<Command>(line);}catch{continue;}
                if(cmd==null)continue;
                form.BeginInvoke((Action)delegate {
                  try {
                    if(cmd.type=="show")form.Start(cmd);
                    else if(cmd.type=="hide")form.Cancel(cmd.id);
                    else if(cmd.type=="quit"){form.Cancel(null);Application.ExitThread();}
                  }catch(Exception ex){form.Cancel(null);form.Emit(new {type="error",id=cmd.id,error=ex.Message});}
                });
                if(cmd.type=="quit")return;
              }
            }catch{}
            try {form.BeginInvoke((Action)delegate {form.Cancel(null);Application.ExitThread();});}catch{}
          }) {IsBackground=true};
          worker.Start();form.Emit(new {type="ready"});Application.Run();
        }
        return 0;
      }catch(Exception ex){Console.Error.WriteLine(ex.ToString());return 1;}
      finally{Native.OleUninitialize();}
    }
  }
}
