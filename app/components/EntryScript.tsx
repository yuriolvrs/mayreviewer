// Blocking pre-paint script that decides what "/" shows: the landing page for
// first-time visitors, the reviewers home for everyone else. Sets
// data-entry="app" on <html> before first paint, so returning users never see
// the landing flash; without it (first visit, no JS, crawlers) the landing
// shows. Same pattern and constraints as ThemeFlashScript.
//
// "Returning" means any of: entered the app before (ENTERED_KEY, set by
// EntryMarker), a signed-in Supabase session, or saved reviewers.
export const ENTERED_KEY = "mayreviewer-entered";

const ENTRY_SCRIPT = `(function(){try{var s=localStorage,app=s.getItem("${ENTERED_KEY}")==="1";if(!app){for(var i=0;i<s.length;i++){var k=s.key(i)||"";if(/^sb-.+-auth-token$/.test(k)){app=true;break;}}}if(!app){var r=JSON.parse(s.getItem("mayreviewer-reviewers")||"[]");app=Array.isArray(r)&&r.length>0;}if(app)document.documentElement.dataset.entry="app";}catch(e){}})();`;

export default function EntryScript() {
  return <script dangerouslySetInnerHTML={{ __html: ENTRY_SCRIPT }} />;
}
