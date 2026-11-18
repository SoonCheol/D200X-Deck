# Run in Windows PowerShell 5.1, STA.
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.IO;
public static class DropProbe {
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClipboardFormatName(uint id,StringBuilder name,int max);
 [DllImport("shell32.dll")] static extern int SHCreateShellItemArrayFromDataObject(System.Runtime.InteropServices.ComTypes.IDataObject data, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IShellItemArray array);
 [ComImport,Guid("b63ea76d-1f85-456f-a19c-48159efa858b"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IShellItemArray {
 [PreserveSig] int BindToHandler(IntPtr p,ref Guid a,ref Guid b,out IntPtr c);
 [PreserveSig] int GetPropertyStore(int flags,ref Guid iid,out IntPtr p);
 [PreserveSig] int GetPropertyDescriptionList(IntPtr key,ref Guid iid,out IntPtr p);
 [PreserveSig] int GetAttributes(int flags,uint mask,out uint attrs);
 [PreserveSig] int GetCount(out uint count);
 [PreserveSig] int GetItemAt(uint index,out IShellItem item);
 }
 [ComImport,Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IShellItem {
 [PreserveSig] int BindToHandler(IntPtr p,ref Guid a,ref Guid b,out IntPtr c);
 [PreserveSig] int GetParent(out IShellItem p);
 [PreserveSig] int GetDisplayName(uint kind,out IntPtr name);
 }
 static string Name(IShellItem i,uint kind) {IntPtr p;int hr=i.GetDisplayName(kind,out p);if(hr<0)return "HRESULT 0x"+hr.ToString("X8");try{return Marshal.PtrToStringUni(p);}finally{Marshal.FreeCoTaskMem(p);}}
 public static void Run(){
 var f=new Form{Text="DeckForge Native Drop Probe",Width=900,Height=680};
 var log=new TextBox{Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Both,Dock=DockStyle.Fill,WordWrap=false};
 var label=new TextBox{Dock=DockStyle.Top,Text="Test target"};
 var zone=new Label{Dock=DockStyle.Top,Height=100,Text="Drop Windows Start menu app or Explorer file here",TextAlign=System.Drawing.ContentAlignment.MiddleCenter,BackColor=System.Drawing.Color.AliceBlue,AllowDrop=true};
 var save=new Button{Text="Save log",Dock=DockStyle.Bottom};
 f.Controls.Add(log);f.Controls.Add(save);f.Controls.Add(zone);f.Controls.Add(label);
 Action<string> write=s=>log.AppendText(s+Environment.NewLine);
 write(Environment.OSVersion.ToString());
 zone.DragEnter+=(s,e)=>{e.Effect=(e.AllowedEffect & DragDropEffects.Copy)!=0?DragDropEffects.Copy:(e.AllowedEffect & DragDropEffects.Link)!=0?DragDropEffects.Link:DragDropEffects.None;};
 zone.DragDrop+=(s,e)=>{
 write("=== "+DateTime.Now.ToString("o")+" "+label.Text+" ===");
 try {
 foreach(string name in e.Data.GetFormats(false))write("Native format: "+name);
 var com=e.Data as System.Runtime.InteropServices.ComTypes.IDataObject;
 if(com!=null){
 var en=com.EnumFormatEtc(DATADIR.DATADIR_GET);var fmt=new FORMATETC[1];var got=new int[1];
 try{while(en.Next(1,fmt,got)==0 && got[0]==1){var a=fmt[0];var n=new StringBuilder(256);uint id=(ushort)a.cfFormat;GetClipboardFormatName(id,n,n.Capacity);write("FORMATETC id="+id+" name="+n+" tymed="+a.tymed+" aspect="+a.dwAspect+" index="+a.lindex);if(a.ptd!=IntPtr.Zero)Marshal.FreeCoTaskMem(a.ptd);}}finally{if(Marshal.IsComObject(en))Marshal.ReleaseComObject(en);}
 Guid iid=typeof(IShellItemArray).GUID;IShellItemArray arr;int hr=SHCreateShellItemArrayFromDataObject(com,ref iid,out arr);
 write("SHCreateShellItemArrayFromDataObject: 0x"+hr.ToString("X8"));
 if(hr>=0 && arr!=null){try{uint count;if(arr.GetCount(out count)>=0)for(uint j=0;j<Math.Min(count,100u);j++){IShellItem item;if(arr.GetItemAt(j,out item)>=0 && item!=null){try{write("Display: "+Name(item,0));write("Parsing: "+Name(item,0x80028000));write("Path: "+Name(item,0x80058000));}finally{Marshal.ReleaseComObject(item);}}}}finally{Marshal.ReleaseComObject(arr);}}
 }else write("COM IDataObject not exposed by WinForms wrapper");
 if(e.Data.GetDataPresent(DataFormats.FileDrop,false)){var paths=e.Data.GetData(DataFormats.FileDrop,false) as string[];if(paths!=null)foreach(var p in paths)write("FileDrop: "+p);}
 }catch(Exception ex){write(ex.ToString());}
 };
 save.Click+=(s,e)=>{using(var d=new SaveFileDialog{FileName="native-drop-log.txt"})if(d.ShowDialog()==DialogResult.OK)File.WriteAllText(d.FileName,log.Text,Encoding.UTF8);};
 Application.Run(f);
 }
}
'@
[DropProbe]::Run()
