// Clean single-system uploader + gallery. Replace previous script.js completely.

// admin detection: returns truthy if token saved in localStorage
function isAdmin(){
  return !!localStorage.getItem('gh_token');
}

// small helper
const $ = id => document.getElementById(id);

// load/save UI settings from localStorage (keys without gh_ for easy use)
function loadSettings(){
  ['owner','repo','branch','token'].forEach(k=>{
    const val = localStorage.getItem('gh_'+k) || '';
    const el = $(k);
    if(el) el.value = val;
  });

  // about text (keeps a local copy so we don't need to fetch the repo every time)
  const about = localStorage.getItem('about_text') || 'I create animations.';
  const aboutTextEl = $('aboutText');
  if(aboutTextEl) aboutTextEl.textContent = about;
  const aboutEdit = $('aboutEdit');
  if(aboutEdit) aboutEdit.value = about;
}

function saveSettings(){
  ['owner','repo','branch','token'].forEach(k=>{
    const el = $(k);
    if(el) localStorage.setItem('gh_'+k, el.value.trim());
  });
  alert('Settings saved to this browser only');
}

function clearSettings(){
  ['owner','repo','branch','token'].forEach(k=>{
    localStorage.removeItem('gh_'+k);
    const el = $(k);
    if(el) el.value = '';
  });
  alert('Settings cleared from this browser');
}

// Build settings object from UI or storage
function getSettings(){
  return {
    owner: ($('owner') && $('owner').value.trim()) || localStorage.getItem('gh_owner') || '',
    repo: ($('repo') && $('repo').value.trim()) || localStorage.getItem('gh_repo') || '',
    branch: ($('branch') && $('branch').value.trim()) || localStorage.getItem('gh_branch') || 'main',
    token: ($('token') && $('token').value.trim()) || localStorage.getItem('gh_token') || ''
  };
}

// GitHub API: create file (base64 content)
async function createFile(path, base64content, message){
  const s = getSettings();
  if(!s.owner || !s.repo || !s.token){
    alert('Enter and save owner, repo and token first.');
    return false;
  }

  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${encodeURIComponent(path)}`;

  // Step 1: Check if file already exists to get SHA
  let sha = null;
  const checkRes = await fetch(apiUrl + `?ref=${encodeURIComponent(s.branch)}`, {
    headers: { Authorization: 'token ' + s.token }
  });

  if(checkRes.ok){
    const existing = await checkRes.json();
    sha = existing.sha;
  }

  // Step 2: Create OR update file
  const body = {
    message: message || `Update ${path}`,
    content: base64content,
    branch: s.branch,
    ...(sha && { sha }) // include sha only if file exists
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

  const txt = await res.text();
  console.error('createFile error', res.status, txt);
  alert('Upload failed: ' + res.status);
  return false;
}

// convenience for text files
async function createTextFile(path, text, message){
  const base64 = btoa(unescape(encodeURIComponent(text)));
  return await createFile(path, base64, message);
}

// convert File -> base64 string (no data: prefix)
function fileToBase64(file){
  return new Promise((res, rej)=>{
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result.split(',')[1];
      res(data);
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// handle upload for a folder (all or toonboom)
async function handleUpload(prefix, fileInputId, descId){
  const fileEl = $(fileInputId);
  if(!fileEl || !fileEl.files || !fileEl.files[0]) { alert('Choose a file first'); return; }
  const f = fileEl.files[0];
  const desc = ($(descId) && $(descId).value) || '';

  if (f.size > 100 * 1024 * 1024) {
    const ok = confirm('File is larger than 100 MB. GitHub may reject large files. Continue?');
    if(!ok) return;
  }

  const base64 = await fileToBase64(f);
  const ts = Date.now();
  const safeName = f.name.replace(/\s+/g,'_');
  const path = `uploads/${prefix}/${ts}_${safeName}`;
  const ok = await createFile(path, base64, `Upload ${safeName} to ${prefix}`);
  if(!ok) return;

  // create small meta JSON
  const meta = {
    filename: `${ts}_${safeName}`,
    original: f.name,
    uploaded_at: new Date().toISOString(),
    description: desc
  };
  await createTextFile(`uploads/${prefix}/meta_${ts}_${safeName}.json`, JSON.stringify(meta, null, 2), `Meta for ${safeName}`);

  alert('Upload complete');
  fileEl.value = '';
  if($(descId)) $(descId).value = '';
  // re-render lists so new item appears for admin immediately
  await renderLists();
}

// Fetch contents from a repo folder using GitHub contents API
async function fetchFolderContents(path){
  const s = getSettings();
  const url = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(s.branch)}`;
  const headers = s.token ? { Authorization: 'token ' + s.token } : {};
  const res = await fetch(url, { headers });
  if(res.status === 404) return [];
  if(!res.ok){
    console.error('fetchFolderContents error', res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Render listing for a folder into containerId
async function renderListFor(prefix, containerId){
  const items = await fetchFolderContents(`uploads/${prefix}`);
  const container = $(containerId);
  if(!container) return;
  container.innerHTML = '';

  // filter files (skip meta jsons)
  const mediaFiles = items.filter(i => i.type === 'file' && !i.name.startsWith('meta_'))
                          .sort((a,b)=>b.name.localeCompare(a.name));

  for(const file of mediaFiles){
    const div = document.createElement('div');
    div.className = 'item';

    // show video if suitable, otherwise image or link
    if(/\.(mp4|webm|ogg)$/i.test(file.name)){
      const v = document.createElement('video');
      // API response provides download_url on each file object
      v.src = file.download_url || `https://raw.githubusercontent.com/${getSettings().owner}/${getSettings().repo}/${getSettings().branch}/${file.path}`;
      v.controls = true;
      v.setAttribute('playsinline','');
      v.style.width = '100%';
      div.appendChild(v);
    } else if(/\.(jpe?g|png|gif|svg)$/i.test(file.name)){
      const img = document.createElement('img');
      img.src = file.download_url || `https://raw.githubusercontent.com/${getSettings().owner}/${getSettings().repo}/${getSettings().branch}/${file.path}`;
      img.alt = file.name;
      div.appendChild(img);
    } else {
      const a = document.createElement('a');
      a.href = file.download_url || `https://raw.githubusercontent.com/${getSettings().owner}/${getSettings().repo}/${getSettings().branch}/${file.path}`;
      a.textContent = file.name;
      a.target = '_blank';
      div.appendChild(a);
    }

    // attempt to find matching meta JSON and display description
    const meta = items.find(m => m.type === 'file' && m.name.startsWith('meta_') && m.name.includes(file.name));
    if(meta){
      try{
        // fetch meta content using the contents API URL (meta.url)
        const metaRes = await fetch(meta.url, getSettings().token ? { headers: { Authorization: 'token ' + getSettings().token } } : {});
        if(metaRes.ok){
          const metaJson = await metaRes.json();
          if(metaJson.content){
            const txt = atob(metaJson.content.replace(/\n/g,''));
            const parsed = JSON.parse(txt);
            if(parsed.description){
              const p = document.createElement('div');
              p.className = 'desc';
              p.textContent = parsed.description;
              div.appendChild(p);
            }
          }
        }
      }catch(e){ console.warn('meta read error', e) }
    }

    container.appendChild(div);
  }
}

// Re-render both lists
async function renderLists(){
  await renderListFor('all','allList');
  await renderListFor('toonboom','toonList');
}

// Hook buttons after DOM loaded
function attachHandlers(){
  const saveBtn = $('saveSettings');
  if(saveBtn) saveBtn.addEventListener('click', saveSettings);
  const clearBtn = $('clearSettings');
  if(clearBtn) clearBtn.addEventListener('click', clearSettings);
  const saveAboutBtn = $('saveAbout');
  if(saveAboutBtn) saveAboutBtn.addEventListener('click', async ()=>{
    const txt = ($('aboutEdit') && $('aboutEdit').value.trim()) || '';
    if(!confirm('Save About text to this device and (optionally) to repository? Click OK to save locally.')) return;
    localStorage.setItem('about_text', txt);
    if($('aboutText')) $('aboutText').textContent = txt;
    // also save a copy in repo (optional)
    const ok = await createTextFile('about/ABOUT.md', txt, 'Update About text');
    if(ok) alert('About saved to repository too.');
  });
  const upAll = $('uploadAllBtn');
  if(upAll) upAll.addEventListener('click', ()=>handleUpload('all','uploadAllFile','uploadAllDesc'));
  const upToon = $('uploadToonBtn');
  if(upToon) upToon.addEventListener('click', ()=>handleUpload('toonboom','uploadToonFile','uploadToonDesc'));
}

// On start
window.addEventListener("load", async () => {
  try {
    loadSettings();
    attachHandlers();

    const s = getSettings();
    if(s.owner && s.repo){
      await renderLists();
    }

    if(!isAdmin()){
      document.querySelectorAll('.admin-controls').forEach(el => el.style.display = 'none');
    }
  } catch(e){
    console.error("Startup error:", e);
  }
});
