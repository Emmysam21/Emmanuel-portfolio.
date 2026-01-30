// ===============================
// PUBLIC REPO INFO (FOR VISITORS)
// ===============================
const PUBLIC_OWNER = "Emmysam21"; // <-- CHANGE THIS
const PUBLIC_REPO = "Emmanuel-portfolio.";
const PUBLIC_BRANCH = "main";

// ===============================
// HELPERS
// ===============================
const $ = id => document.getElementById(id);

function isAdmin(){
  return !!localStorage.getItem('gh_token');
}

function getSettings(){
  return {
    owner: localStorage.getItem('gh_owner') || PUBLIC_OWNER,
    repo: localStorage.getItem('gh_repo') || PUBLIC_REPO,
    branch: localStorage.getItem('gh_branch') || PUBLIC_BRANCH,
    token: localStorage.getItem('gh_token') || ''
  };
}

// ===============================
// LOAD ABOUT FOR VISITORS
// ===============================
async function loadPublicAbout(){
  try{
    const url = `https://raw.githubusercontent.com/${PUBLIC_OWNER}/${PUBLIC_REPO}/${PUBLIC_BRANCH}/about/ABOUT.md`;
    const res = await fetch(url);
    if(res.ok){
      const txt = await res.text();
      if($('aboutText')) $('aboutText').textContent = txt;
    }
  }catch(e){
    console.warn("Could not load public about");
  }
}

// ===============================
// GITHUB FILE CREATE OR UPDATE
// ===============================
async function createFile(path, base64content, message){
  const s = getSettings();
  if(!s.token){
    alert("Admin token missing");
    return false;
  }

  const apiUrl = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${path}`;

  let sha = null;
  const checkRes = await fetch(apiUrl + `?ref=${s.branch}`, {
    headers: { Authorization: 'token ' + s.token }
  });

  if(checkRes.ok){
    const existing = await checkRes.json();
    sha = existing.sha;
  }

  const body = {
    message: message || `Update ${path}`,
    content: base64content,
    branch: s.branch,
    ...(sha && { sha })
  };

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: 'token ' + s.token,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if(res.ok) return true;

  alert("Upload failed " + res.status);
  return false;
}

async function createTextFile(path, text, message){
  const base64 = btoa(unescape(encodeURIComponent(text)));
  return await createFile(path, base64, message);
}

// ===============================
// FILE TO BASE64
// ===============================
function fileToBase64(file){
  return new Promise((res, rej)=>{
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// ===============================
// UPLOAD HANDLER (ADMIN ONLY)
// ===============================
async function handleUpload(prefix, fileInputId, descId){
  const fileEl = $(fileInputId);
  if(!fileEl.files[0]) return alert("Choose a file");

  const f = fileEl.files[0];
  const desc = ($(descId) && $(descId).value) || '';

  const base64 = await fileToBase64(f);
  const ts = Date.now();
  const safeName = f.name.replace(/\s+/g,'_');

  const path = `uploads/${prefix}/${ts}_${safeName}`;
  const ok = await createFile(path, base64, `Upload ${safeName}`);
  if(!ok) return;

  const meta = {
    filename: `${ts}_${safeName}`,
    description: desc,
    uploaded_at: new Date().toISOString()
  };

  await createTextFile(`uploads/${prefix}/meta_${ts}_${safeName}.json`, JSON.stringify(meta, null, 2), "Meta");

  alert("Upload complete");
  renderLists();
}

// ===============================
// FETCH FOLDER CONTENTS (PUBLIC)
// ===============================
async function fetchFolderContents(path){
  const s = getSettings();
  const url = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${path}?ref=${s.branch}`;
  const res = await fetch(url);
  if(!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ===============================
// RENDER VIDEOS
// ===============================
async function renderListFor(prefix, containerId){
  const items = await fetchFolderContents(`uploads/${prefix}`);
  const container = $(containerId);
  if(!container) return;

  container.innerHTML = '';

  const mediaFiles = items.filter(i => i.type === 'file' && !i.name.startsWith('meta_'))
                          .sort((a,b)=>b.name.localeCompare(a.name));

  for(const file of mediaFiles){
    const div = document.createElement('div');
    div.className = 'item';

    const url = `https://raw.githubusercontent.com/${PUBLIC_OWNER}/${PUBLIC_REPO}/${PUBLIC_BRANCH}/${file.path}`;

    if(/\.(mp4|webm|ogg)$/i.test(file.name)){
      const v = document.createElement('video');
      v.src = url;
      v.controls = true;
      v.style.width = "100%";
      div.appendChild(v);
    } else if(/\.(jpg|jpeg|png|gif)$/i.test(file.name)){
      const img = document.createElement('img');
      img.src = url;
      div.appendChild(img);
    }

    container.appendChild(div);
  }
}

async function renderLists(){
  await renderListFor('all','allList');
  await renderListFor('toonboom','toonList');
}

// ===============================
// SETTINGS SAVE (ADMIN)
// ===============================
function saveSettings(){
  ['owner','repo','branch','token'].forEach(k=>{
    const el = $(k);
    if(el) localStorage.setItem('gh_'+k, el.value.trim());
  });
  alert("Settings saved");
}

// ===============================
// ON LOAD
// ===============================
window.addEventListener("load", async () => {

  if(!isAdmin()){
    document.querySelectorAll('.admin-controls, .upload').forEach(el => el.style.display = 'none');
    loadPublicAbout();
  }

  const saveBtn = $('saveSettings');
  if(saveBtn) saveBtn.addEventListener('click', saveSettings);

  const saveAboutBtn = $('saveAbout');
  if(saveAboutBtn) saveAboutBtn.addEventListener('click', async ()=>{
    const txt = $('aboutEdit').value.trim();
    localStorage.setItem('about_text', txt);
    $('aboutText').textContent = txt;
    await createTextFile('about/ABOUT.md', txt, 'Update About');
    alert("About saved");
  });

  const upAll = $('uploadAllBtn');
  if(upAll) upAll.addEventListener('click', ()=>handleUpload('all','uploadAllFile','uploadAllDesc'));

  const upToon = $('uploadToonBtn');
  if(upToon) upToon.addEventListener('click', ()=>handleUpload('toonboom','uploadToonFile','uploadToonDesc'));

  renderLists();
});
