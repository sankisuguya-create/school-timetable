// タブ・ブックマークのアイコン。外部の置き場を使わず、画像をここに base64 で持つ。
// 仕組みと注意は design リポジトリの app-icons/README.md。
// setupSheets から ensureIcon_() が呼ばれ、所有者のドライブに PNG を作る。doGet が setFaviconUrl に渡す。
// 画像を替えた版を貼って setupSheets（または selfTestIcon）を実行すれば作り直す。

var ICON_PNG_B64 = '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';
var ICON_NAME = '週案-icon.png';

function ensureIcon_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('ICON_ID');
  var ver = String(ICON_PNG_B64.length) + ICON_PNG_B64.slice(-16);
  if (id && props.getProperty('ICON_VER') === ver) { try { DriveApp.getFileById(id); return id; } catch (e) { /* 消されていたら作り直す */ } }
  if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* 前の画像が無くても続ける */ } }
  var f = DriveApp.createFile(Utilities.newBlob(Utilities.base64Decode(ICON_PNG_B64), 'image/png', ICON_NAME));
  try { f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  props.setProperty('ICON_ID', f.getId()); props.setProperty('ICON_VER', ver);
  return f.getId();
}
function iconUrl_() {
  var id = PropertiesService.getScriptProperties().getProperty('ICON_ID');
  return id ? 'https://drive.google.com/uc?export=view&id=' + id + '&.png' : '';
}
// 画面に付ける。失敗しても、アイコンが無くても画面は開く
function withIcon_(out) {
  try { var u = iconUrl_(); if (u) out.setFaviconUrl(u); } catch (e) { /* アイコンは無くてよい */ }
  return out;
}
// エディタから実行すると、実行の記録に ○✕ を出す
function selfTestIcon() { try { console.log('○ タブのアイコン：' + ensureIcon_()); } catch (e) { console.log('✕ タブのアイコン：' + e.message); } }
