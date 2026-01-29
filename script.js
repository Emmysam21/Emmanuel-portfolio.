// Very simple static uploader + viewer using GitHub repository as storage.
// WARNING: Keep your token safe. The script stores token in localStorage in your browser only.

const $ = id => document.getElementById(id);

// Save/Load settings
function loadSettings(){
  const keys = ['owner','repo','branch','token'];
  keys.forEach(k => {
    const val = localStorage.getItem('gh_'+k) || '';
    $(k).value = val;
  });

  // About text
  const about = localStorage.getItem('about_text') || 'I create animations.';
  $('aboutText').textContent = about;
  $('aboutEdit').value = about;
}
function saveSettings(){
  ['owner','repo','branch','token'].forEach(k=>{
    localStorage.setItem('gh_'+k, $(k).value.trim());
  });
  alert('Settings saved in this browser.');
}
function clearSettings(){
  ['owner','repo','branch','token'].forEach(k=>{
    localStorage.removeItem('gh_'+k);
    $(k).value = '';
  });
  alert('Settings cleared.');
}

$('saveSettings').addEventListener('click', saveSettings);
$('clearSettings').addEventListener('click', clearSettings);

$('saveAbout').addEventListener('click', async ()=>{
  const txt = $('aboutEdit').value.trim();
  if(!confirm('Save About text to repository? This will create a file about/ABOUT.md')) return;
  const ok = await createTextFile('about/ABOUT.md', txt, 'Update About text');
  if(ok) {
    localStorage.setItem('about_text', txt);
    $('aboutText').textContent = txt;
    alert('About text saved.');
  }
});

// Upload helpers
function getSettings(){
  return {
    owner: $('owner').value.trim() || localStorage.getItem('gh_owner') || '',
    repo: $('repo').value.trim() || localStorage.getItem('gh_repo') || '',
    branch: $('branch').value.trim() || localStorage.getItem('gh_branch') || 'main',
    token: $('token').value.trim() || localStorage.getItem('gh_token') || ''
  };
}

// Basic: create a new file at path with base64 content
async function createFile(path, contentBase64, message){
  const s = getSettings();
  if(!s.owner || !s.repo || !s.token){
    alert('Enter GitHub owner, repo and token in settings first.');
    return false;
  }
  const url = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: message || `Upload ${path}`,
    content: contentBase64,
    branch: s.branch
  };
  const res = await fetch(url, {
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
  console.error('Upload error', res.status, txt);
  alert('Upload failed: ' + res.status + '. See console for details.');
  return false;
}

// Convenience: create text file
async function createTextFile(path, text, message){
  const base64 = btoa(unescape(encodeURIComponent(text)));
  return await createFile(path, base64, message || `Add ${path}`);
}

// file -> base64
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

// Upload handlers
async function handleUpload(prefix, fileInputId, descId){
  const f = $(fileInputId).files[0];
  if(!f) { alert('Choose a file first'); return; }
  const desc = $(descId).value || '';
  if (f.size > 100 * 1024 * 1024) {
    const ok = confirm('File is larger than 100 MB. GitHub may reject large files. Do you want to continue?');
    if(!ok) return;
  }
  const bin = await fileToBase64(f);
  const ts = Date.now();
  const safeName = f.name.replace(/\s+/g,'_');
  const path = `uploads/${prefix}/${ts}_${safeName}`;
  const ok = await createFile(path, bin, `Upload ${safeName} to ${prefix}`);
  if(!ok) return;
  // add description as JSON meta
  const meta = {
    filename: `${ts}_${safeName}`,
    original: f.name,
    uploaded_at: new Date().toISOString(),
    description: desc
  };
  await createTextFile(`uploads/${prefix}/meta_${ts}_${safeName}.json`, JSON.stringify(meta, null, 2), `Add meta for ${safeName}`);
  alert('Upload complete.');
  await renderLists();
}

// Render lists by reading repo folder contents (works for public repo without token; token helps for private)
async function fetchFolderContents(path){
  const s = getSettings();
  const url = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(s.branch)}`;
  const headers = s.token ? { Authorization: 'token ' + s.token } : {};
  const res = await fetch(url, { headers });
  if(res.status === 404) return [];
  if(!res.ok){
    console.error('list error', res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function renderListFor(prefix, containerId){
  const items = await fetchFolderContents(`uploads/${prefix}`);
  const container = $(containerId);
  container.innerHTML = '';
  // Group video/media files and lookup meta json
  const media = items.filter(i => i.type === 'file' && !i.name.startsWith('meta_')).sort((a,b)=>b.name.localeCompare(a.name));
  for(const file of media){
    const raw = `https://raw.githubusercontent.com/${getSettings().owner}/${getSettings().repo}/${getSettings().branch}/${file.path}`;
    // try to find meta by name prefix
    const metaName = items.find(m=>m.name.startsWith('meta_') && m.name.includes(file.name));
    let desc = '';
    if(metaName){
      try{
        const metaRes = await fetch(metaName.url, getSettings().token ? { headers: { Authorization: 'token ' + getSettings().token }} : {});
        if(metaRes.ok){
          const meta = await metaRes.json();
          // meta content is base64, but when using contents API it returns "content" base64
          if(meta.content){
            const txt = atob(meta.content.replace(/\n/g,''));
            const parsed = JSON.parse(txt);
            desc = parsed.description || '';
          }
        }
      }catch(e){ console.warn('meta read', e) }
    }
    // create element
    const div = document.createElement('div');
    div.className = 'item';
    // if video extension
    if(/\.(mp4|webm|ogg)$/i.test(file.name)){
      const v = document.createElement('video');
      v.controls = true;
      v.src = raw;
      v.setAttribute('playsinline','');
      div.appendChild(v);
    } else if(/\.(jpe?g|png|gif|svg)$/i.test(file.name)){
      const i = document.createElement('img');
      i.src = raw;
      i.alt = file.name;
      div.appendChild(i);
    } else {
      const a = document.createElement('a');
      a.href = raw;
      a.textContent = file.name;
      a.target = '_blank';
      div.appendChild(a);
    }
    if(desc){
      const p = document.createElement('div');
      p.className='desc';
      p.textContent = desc;
      div.appendChild(p);
    }
    container.appendChild(div);
  }
}

async function renderLists(){
  await renderListFor('all','allList');
  await renderListFor('toonboom','toonList');
}

// Hook upload buttons
$('uploadAllBtn').addEventListener('click', ()=>handleUpload('all','uploadAllFile','uploadAllDesc'));
$('uploadToonBtn').addEventListener('click', ()=>handleUpload('toonboom','uploadToonFile','uploadToonDesc'));

// initial load
loadSettings();
renderLists();
