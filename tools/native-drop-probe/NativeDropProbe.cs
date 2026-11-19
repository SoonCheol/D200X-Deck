using System;
using System.Collections.Generic;
using System.IO;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using ComData = System.Runtime.InteropServices.ComTypes.IDataObject;

namespace DeckForgeNativeDrop {
  [StructLayout(LayoutKind.Sequential)]
  public struct PointL { public int x, y; }

  [ComVisible(true), Guid("00000122-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface INativeDropTarget {
    [PreserveSig] int DragEnter([MarshalAs(UnmanagedType.Interface)] ComData data, uint keys, PointL pt, ref uint effect);
    [PreserveSig] int DragOver(uint keys, PointL pt, ref uint effect);
    [PreserveSig] int DragLeave();
    [PreserveSig] int Drop([MarshalAs(UnmanagedType.Interface)] ComData data, uint keys, PointL pt, ref uint effect);
  }

  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    [PreserveSig] int BindToHandler(IntPtr ctx, ref Guid handler, ref Guid iid, out IntPtr result);
    [PreserveSig] int GetParent(out IShellItem parent);
    [PreserveSig] int GetDisplayName(uint form, out IntPtr name);
    [PreserveSig] int GetAttributes(uint mask, out uint attrs);
    [PreserveSig] int Compare(IShellItem other, uint hint, out int order);
  }
  [ComImport, Guid("B63EA76D-1F85-456F-A19C-48159EFA858B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemArray {
    [PreserveSig] int BindToHandler(IntPtr ctx, ref Guid handler, ref Guid iid, out IntPtr result);
    [PreserveSig] int GetPropertyStore(uint flags, ref Guid iid, out IntPtr result);
    [PreserveSig] int GetPropertyDescriptionList(ref PropertyKey key, ref Guid iid, out IntPtr result);
    [PreserveSig] int GetAttributes(uint flags, uint mask, out uint attrs);
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int GetItemAt(uint index, out IShellItem item);
    [PreserveSig] int EnumItems(out IntPtr enumerator);
  }
  [StructLayout(LayoutKind.Sequential, Pack=4)]
  struct PropertyKey { public Guid fmtid; public uint pid; }
  // This diagnostic is compiled x64; PROPVARIANT is 24 bytes on x64.
  [StructLayout(LayoutKind.Explicit, Size=24)]
  struct PropVariant {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr pointer;
  }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int GetAt(uint index, out PropertyKey key);
    [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
    [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
    [PreserveSig] int Commit();
  }
  static class Native {
    [DllImport("ole32.dll")] internal static extern int OleInitialize(IntPtr reserved);
    [DllImport("ole32.dll")] internal static extern void OleUninitialize();
    [DllImport("ole32.dll")] internal static extern int RegisterDragDrop(IntPtr hwnd, INativeDropTarget target);
    [DllImport("ole32.dll")] internal static extern int RevokeDragDrop(IntPtr hwnd);
    [DllImport("ole32.dll")] internal static extern int PropVariantClear(ref PropVariant value);
    [DllImport("ole32.dll")] internal static extern void ReleaseStgMedium(ref STGMEDIUM medium);
    [DllImport("shell32.dll")] internal static extern int SHCreateShellItemArrayFromDataObject(ComData data, ref Guid iid, out IShellItemArray items);
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, ExactSpelling=true)]
    internal static extern int SHCreateItemFromParsingName(string path, IntPtr ctx, ref Guid iid, out IShellItem item);
    [DllImport("shell32.dll")] internal static extern int SHGetIDListFromObject([MarshalAs(UnmanagedType.IUnknown)] object unknown, out IntPtr pidl);
    [DllImport("shell32.dll")] internal static extern int SHGetPropertyStoreFromIDList(IntPtr pidl, uint flags, ref Guid iid, out IPropertyStore store);
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)] internal static extern uint DragQueryFile(IntPtr drop, uint index, StringBuilder path, uint size);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] internal static extern int GetClipboardFormatName(uint format, StringBuilder name, int max);
    internal static string Hr(int hr) { return "0x"+unchecked((uint)hr).ToString("X8"); }
    internal static void Release(object value) { if(value!=null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }
  }
  static class Inspect {
    static string Name(IShellItem item, uint kind) {
      IntPtr ptr=IntPtr.Zero;
      try { int hr=item.GetDisplayName(kind,out ptr); return hr>=0 && ptr!=IntPtr.Zero ? Marshal.PtrToStringUni(ptr) : null; }
      finally { if(ptr!=IntPtr.Zero) Marshal.FreeCoTaskMem(ptr); }
    }
    static string AppId(IShellItem item) {
      IntPtr pidl=IntPtr.Zero; IPropertyStore store=null; PropVariant value=new PropVariant();
      try {
        if(Native.SHGetIDListFromObject(item,out pidl)<0 || pidl==IntPtr.Zero) return null;
        Guid iid=typeof(IPropertyStore).GUID;
        if(Native.SHGetPropertyStoreFromIDList(pidl,0,ref iid,out store)<0 || store==null) return null;
        PropertyKey key=new PropertyKey {fmtid=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),pid=5};
        if(store.GetValue(ref key,out value)<0 || value.pointer==IntPtr.Zero) return null;
        if(value.vt==31) return Marshal.PtrToStringUni(value.pointer);
        if(value.vt==8) return Marshal.PtrToStringBSTR(value.pointer);
        return null;
      } finally {
        Native.PropVariantClear(ref value);
        Native.Release(store);
        if(pidl!=IntPtr.Zero) Marshal.FreeCoTaskMem(pidl);
      }
    }
    static string Candidate(string path) {
      if(String.IsNullOrEmpty(path)) return null;
      // Candidate only; no launch and no trust in a path or AppID until editor validation.
      if(Directory.Exists(path)) return "folder";
      if(!File.Exists(path)) return null;
      string ext=Path.GetExtension(path).ToLowerInvariant();
      return ext==".exe" || ext==".lnk" || ext==".bat" || ext==".cmd" ? "program" : null;
    }
    internal static Dictionary<string,object> Item(IShellItem item) {
      var result=new Dictionary<string,object>();
      string path=Name(item,0x80058000), parsing=Name(item,0x80028000);
      result["name"]=Name(item,0);
      result["fileSystemPath"]=path;
      result["parsingName"]=parsing;
      uint attrs; int hr=item.GetAttributes(0x60000000,out attrs);
      result["attributes"]=hr>=0 ? Native.Hr(unchecked((int)attrs)) : Native.Hr(hr);
      string appId=null;
      try { appId=AppId(item); } catch(Exception ex) { result["appIdError"]=ex.Message; }
      result["appId"]=appId;
      string kind=Candidate(path);
      result["candidateKind"]=kind ?? (!String.IsNullOrEmpty(appId) ? "app-id-unverified" : "unresolved");
      return result;
    }
    static List<object> Formats(ComData data) {
      var list=new List<object>(); IEnumFORMATETC enumerator=null;
      try {
        enumerator=data.EnumFormatEtc(DATADIR.DATADIR_GET);
        if(enumerator==null) return list;
        FORMATETC[] values=new FORMATETC[1]; int[] fetched=new int[1];
        while(list.Count<128 && enumerator.Next(1,values,fetched)==0 && fetched[0]==1) {
          var f=values[0]; uint id=unchecked((ushort)f.cfFormat);
          try {
            var name=new StringBuilder(256);
            string label=Native.GetClipboardFormatName(id,name,name.Capacity)>0 ? name.ToString() : (id==15 ? "CF_HDROP" : "standard");
            list.Add(new {id=id,name=label,tymed=f.tymed.ToString(),aspect=f.dwAspect.ToString(),index=f.lindex});
          } finally { if(f.ptd!=IntPtr.Zero) Marshal.FreeCoTaskMem(f.ptd); }
        }
      } finally { Native.Release(enumerator); }
      return list;
    }
    static List<object> Files(ComData data) {
      var list=new List<object>();
      FORMATETC format=new FORMATETC {cfFormat=15,dwAspect=DVASPECT.DVASPECT_CONTENT,lindex=-1,tymed=TYMED.TYMED_HGLOBAL};
      if(data.QueryGetData(ref format)!=0) return list;
      STGMEDIUM medium; data.GetData(ref format,out medium);
      try {
        if(medium.tymed!=TYMED.TYMED_HGLOBAL || medium.unionmember==IntPtr.Zero) return list;
        uint count=Math.Min(Native.DragQueryFile(medium.unionmember,UInt32.MaxValue,null,0),64u);
        for(uint i=0;i<count;i++) {
          uint len=Native.DragQueryFile(medium.unionmember,i,null,0);
          if(len==0 || len>32767) continue;
          var path=new StringBuilder((int)len+1);
          if(Native.DragQueryFile(medium.unionmember,i,path,(uint)path.Capacity)>0)
            list.Add(new {path=path.ToString(),candidateKind=Candidate(path.ToString()) ?? "unresolved"});
        }
      } finally {Native.ReleaseStgMedium(ref medium);}
      return list;
    }
    internal static Dictionary<string,object> Drop(ComData data, PointL pt, uint allowed) {
      var result=new Dictionary<string,object> {{"utc",DateTime.UtcNow.ToString("o")},{"x",pt.x},{"y",pt.y},{"allowedEffects",allowed}};
      var items=new List<object>(); result["shellItems"]=items;
      try { result["formats"]=Formats(data); } catch(Exception ex) {result["formatError"]=ex.Message;}
      IShellItemArray array=null;
      try {
        Guid iid=typeof(IShellItemArray).GUID;
        int hr=Native.SHCreateShellItemArrayFromDataObject(data,ref iid,out array);
        result["shellArrayHr"]=Native.Hr(hr);
        if(hr>=0 && array!=null) {
          uint count; Marshal.ThrowExceptionForHR(array.GetCount(out count)); result["itemCount"]=count;
          for(uint i=0;i<Math.Min(count,64u);i++) {
            IShellItem item=null;
            try {Marshal.ThrowExceptionForHR(array.GetItemAt(i,out item)); items.Add(Item(item));}
            catch(Exception ex) {items.Add(new {index=i,error=ex.Message});}
            finally {Native.Release(item);}
          }
        }
      } catch(Exception ex) {result["shellError"]=ex.Message;}
      finally {Native.Release(array);}
      try {result["fileDrop"]=Files(data);} catch(Exception ex) {result["fileDropError"]=ex.Message;}
      return result;
    }
    internal static void SelfTest() {
      if(IntPtr.Size!=8 || Marshal.SizeOf(typeof(PropVariant))!=24) throw new Exception("Incorrect native layout");
      string file=typeof(Inspect).Assembly.Location;
      foreach(string path in new [] {file,Path.GetDirectoryName(file)}) {
        IShellItem item=null;
        try {
          Guid iid=typeof(IShellItem).GUID;
          Marshal.ThrowExceptionForHR(Native.SHCreateItemFromParsingName(path,IntPtr.Zero,ref iid,out item));
          var result=Item(item);
          if(!String.Equals((string)result["fileSystemPath"],path,StringComparison.OrdinalIgnoreCase) ||
              !String.Equals((string)result["candidateKind"],path==file?"program":"folder",StringComparison.Ordinal))
            throw new Exception("Shell item extraction failed: "+path);
        } finally {Native.Release(item);}
      }
      // Synthetic file data is not a substitute for real Start-menu drags.
      var synthetic=new DataObject(DataFormats.FileDrop,new [] {file});
      var report=Drop((ComData)synthetic,new PointL(),1);
      var files=(List<object>)report["fileDrop"];
      if(files.Count!=1) throw new Exception("CF_HDROP extraction failed");
    }
  }
  [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
  public sealed class Target : INativeDropTarget {
    readonly Action<Dictionary<string,object>> onDrop;
    internal Target(Action<Dictionary<string,object>> callback) {onDrop=callback;}
    // Diagnostic never performs a move or copies a file.
    static uint Effect(uint allowed) {return (allowed&4)!=0 ? 4u : (allowed&1)!=0 ? 1u : 0u;}
    public int DragEnter(ComData data,uint keys,PointL pt,ref uint effect) {effect=Effect(effect);return 0;}
    public int DragOver(uint keys,PointL pt,ref uint effect) {effect=Effect(effect);return 0;}
    public int DragLeave() {return 0;}
    public int Drop(ComData data,uint keys,PointL pt,ref uint effect) {
      uint allowed=effect; effect=0;
      try {onDrop(Inspect.Drop(data,pt,allowed));effect=Effect(allowed);}
      catch(Exception ex) {try {onDrop(new Dictionary<string,object>{{"error",ex.ToString()}});} catch {}}
      return 0;
    }
  }
  sealed class DropPanel : Panel {
    readonly Target target; IntPtr registered;
    internal DropPanel(Action<Dictionary<string,object>> callback) {
      target=new Target(callback);
      BackColor=Color.FromArgb(40,48,60); ForeColor=Color.White;
    }
    protected override void OnHandleCreated(EventArgs e) {
      base.OnHandleCreated(e);
      Marshal.ThrowExceptionForHR(Native.RegisterDragDrop(Handle,target)); registered=Handle;
    }
    protected override void OnHandleDestroyed(EventArgs e) {
      if(registered!=IntPtr.Zero) {Native.RevokeDragDrop(registered);registered=IntPtr.Zero;}
      base.OnHandleDestroyed(e);
    }
    protected override void OnPaint(PaintEventArgs e) {
      base.OnPaint(e);
      TextRenderer.DrawText(e.Graphics,"Drop Windows Start menu apps, shortcuts, EXE files or folders HERE",
        Font,ClientRectangle,ForeColor,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.WordBreak);
    }
  }
  sealed class ProbeForm : Form {
    readonly List<object> records=new List<object>();
    readonly TextBox output=new TextBox {Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Both,WordWrap=false,Dock=DockStyle.Fill};
    readonly JavaScriptSerializer serializer=new JavaScriptSerializer {MaxJsonLength=8*1024*1024};
    internal ProbeForm() {
      Text="DeckForge Native Drop Test (diagnostic only)"; Width=880;Height=600;
      var bar=new FlowLayoutPanel {Dock=DockStyle.Bottom,Height=44};
      var save=new Button {Text="Save JSON log",AutoSize=true};
      save.Click+=delegate {
        using(var dlg=new SaveFileDialog {Filter="JSON log|*.json",FileName="native-drop-log.json"}) {
          if(dlg.ShowDialog(this)==DialogResult.OK) {
            try {File.WriteAllText(dlg.FileName,serializer.Serialize(records),new UTF8Encoding(false));}
            catch(Exception ex) {MessageBox.Show(this,ex.Message,"Save failed");}
          }
        }
      };
      var clear=new Button {Text="Clear",AutoSize=true};
      clear.Click+=delegate {records.Clear();output.Clear();};
      bar.Controls.Add(save);bar.Controls.Add(clear);
      Controls.Add(output);Controls.Add(bar);
      Controls.Add(new DropPanel(AddResult) {Dock=DockStyle.Top,Height=150});
      output.Text="No files will be launched, moved or registered. Drop each target once in the top area.";
    }
    void AddResult(Dictionary<string,object> result) {
      records.Add(result);
      output.AppendText(Environment.NewLine+Environment.NewLine+serializer.Serialize(result));
    }
  }
  static class Program {
    [STAThread]
    static int Main(string[] args) {
      int hr=Native.OleInitialize(IntPtr.Zero);
      if(hr<0) return 2;
      bool selfTest=args.Length==1 && args[0]=="--self-test";
      try {
        if(selfTest) {Inspect.SelfTest();return 0;}
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        using(var form=new ProbeForm()) Application.Run(form);
        return 0;
      } catch(Exception ex) {
        if(!selfTest) MessageBox.Show(ex.ToString(),"Native drop probe error");
        else File.WriteAllText(Path.Combine(Path.GetTempPath(),"DeckForge-NativeDrop-Test-error.txt"),ex.ToString());
        return 1;
      } finally {Native.OleUninitialize();}
    }
  }
}
