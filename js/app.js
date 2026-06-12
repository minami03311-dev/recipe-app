/* ============================================================
   レシピ帖 — メインロジック
   ============================================================ */

const BUCKET = "recipe-images";
const supa = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

// アプリの状態
const state = {
  user: null,
  recipes: [],          // 取得済みレシピ（新しい順）
  selectedTags: [],     // 検索でしぼり込んでいるタグ
  keyword: "",
  editing: null,        // 編集中レシピ（新規はnull）
  formTags: [],         // フォームで入力中のタグ
  pickedFile: null,     // フォームで選んだ画像ファイル
  removeImage: false,   // 編集で画像を消すフラグ
  currentTab: "home",
};

// 要素ショートカット
const $ = (id) => document.getElementById(id);

/* ---------- 起動 ---------- */
async function init() {
  // ログイン/ログアウトの変化を監視
  supa.auth.onAuthStateChange((_event, session) => {
    handleSession(session);
  });
  const { data } = await supa.auth.getSession();
  handleSession(data.session);

  bindEvents();
  registerServiceWorker();
}

function handleSession(session) {
  state.user = session?.user ?? null;
  if (state.user) {
    $("view-login").classList.add("hidden");
    $("app").classList.remove("hidden");
    loadRecipes();
  } else {
    $("app").classList.add("hidden");
    $("view-login").classList.remove("hidden");
  }
}

/* ---------- イベント登録 ---------- */
function bindEvents() {
  $("btn-auth").addEventListener("click", submitAuth);
  $("btn-switch-mode").addEventListener("click", () =>
    setAuthMode(authMode === "login" ? "signup" : "login")
  );
  $("login-email").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $("login-password").focus(); }
  });
  $("login-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitAuth(); }
  });
  $("btn-logout").addEventListener("click", logout);
  $("btn-back").addEventListener("click", goBack);

  // 下部タブ
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      const tab = t.dataset.tab;
      if (tab === "add") openForm();
      else switchTab(tab);
    })
  );
  $("fab").addEventListener("click", () => openForm());

  // 検索
  $("search-input").addEventListener("input", (e) => {
    state.keyword = e.target.value.trim().toLowerCase();
    renderSearch();
  });

  // フォーム
  $("recipe-form").addEventListener("submit", saveRecipe);
  $("btn-cancel").addEventListener("click", goBack);
  $("f-image-preview").addEventListener("click", () => $("f-image").click());
  $("f-image").addEventListener("change", onPickImage);
  $("f-image-clear").addEventListener("click", clearImage);

  // タグ入力（Enter または カンマで確定）
  $("f-tag-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addFormTag(e.target.value);
      e.target.value = "";
      renderTagSuggest();
    }
  });
  $("f-tag-input").addEventListener("input", renderTagSuggest);
  $("f-tag-input").addEventListener("blur", (e) => {
    if (e.target.value.trim()) { addFormTag(e.target.value); e.target.value = ""; renderTagSuggest(); }
  });
}

/* ---------- 認証（メールアドレス＋パスワード） ---------- */
let authMode = "login"; // "login" または "signup"

function setAuthMode(m) {
  authMode = m;
  $("btn-auth").textContent = m === "login" ? "ログイン" : "登録してはじめる";
  $("login-password").setAttribute(
    "autocomplete",
    m === "login" ? "current-password" : "new-password"
  );
  $("switch-label").textContent =
    m === "login" ? "はじめての方は" : "登録済みの方は";
  $("btn-switch-mode").textContent = m === "login" ? "新規登録" : "ログイン";
}

async function submitAuth() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email) { toast("メールアドレスを入力してください"); return; }
  if (password.length < 6) { toast("パスワードは6文字以上にしてください"); return; }

  showLoading(true);
  try {
    if (authMode === "signup") {
      const { data, error } = await supa.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        showLoading(false);
        toast("登録しました。確認メールが必要な設定になっています");
        return;
      }
    } else {
      const { error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    showLoading(false);
    // 成功すると onAuthStateChange が画面を切り替えます
  } catch (err) {
    showLoading(false);
    const m = err.message || "";
    if (m.includes("Invalid login")) toast("メールアドレスかパスワードが違います");
    else if (m.includes("already registered")) toast("このメールは登録済みです。「ログイン」を選んでください");
    else if (m.toLowerCase().includes("password")) toast("パスワードは6文字以上にしてください");
    else toast("うまくいきませんでした：" + m);
  }
}

async function logout() {
  if (!confirm("ログアウトしますか？")) return;
  await supa.auth.signOut();
}

/* ---------- データ取得 ---------- */
async function loadRecipes() {
  showLoading(true);
  const { data, error } = await supa
    .from("recipes")
    .select("*")
    .order("updated_at", { ascending: false });
  showLoading(false);
  if (error) { toast("読み込みに失敗：" + error.message); return; }
  state.recipes = data || [];
  renderHome();
  renderSearch();
}

/* ---------- 画面切り替え ---------- */
function switchTab(tab) {
  state.currentTab = tab;
  ["home", "search", "detail", "form"].forEach((v) =>
    $("view-" + v).classList.add("hidden")
  );
  $("view-" + tab).classList.remove("hidden");

  // タブの選択表示
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === tab)
  );

  // 上部バー・FAB
  const titles = { home: "レシピ帖", search: "さがす" };
  $("appbar-title").textContent = titles[tab] || "レシピ帖";
  $("btn-back").classList.add("hidden");
  $("btn-logout").classList.remove("hidden");
  $("fab").classList.remove("hidden");
  window.scrollTo(0, 0);
}

// 詳細・フォームなど「奥の画面」を開く
function openSubview(view, title) {
  ["home", "search", "detail", "form"].forEach((v) =>
    $("view-" + v).classList.add("hidden")
  );
  $("view-" + view).classList.remove("hidden");
  $("appbar-title").textContent = title;
  $("btn-back").classList.remove("hidden");
  $("btn-logout").classList.add("hidden");
  $("fab").classList.add("hidden");
  window.scrollTo(0, 0);
}

function goBack() {
  switchTab(state.currentTab === "search" ? "search" : "home");
}

/* ---------- ホーム一覧 ---------- */
function renderHome() {
  const list = $("home-list");
  list.innerHTML = "";
  if (state.recipes.length === 0) {
    $("home-empty").classList.remove("hidden");
    return;
  }
  $("home-empty").classList.add("hidden");
  state.recipes.forEach((r) => list.appendChild(recipeCard(r)));
}

function recipeCard(r) {
  const card = document.createElement("div");
  card.className = "card";
  const tags = (r.tags || []).slice(0, 2)
    .map((t) => `<span class="chip mini">${esc(t)}</span>`).join("");
  card.innerHTML = `
    <div class="card-thumb" ${r.image_url ? `style="background-image:url('${esc(r.image_url)}')"` : ""}>
      ${r.image_url ? "" : "🍽"}
    </div>
    <div class="card-body">
      <p class="card-title">${esc(r.title)}</p>
      <div class="card-tags">${tags}</div>
    </div>`;
  card.addEventListener("click", () => openDetail(r.id));
  return card;
}

/* ---------- 検索 ---------- */
function renderSearch() {
  // タグのチップ（使われている全タグ）
  const allTags = [...new Set(state.recipes.flatMap((r) => r.tags || []))].sort();
  const tagWrap = $("search-tags");
  tagWrap.innerHTML = "";
  if (allTags.length === 0) {
    tagWrap.innerHTML = `<span class="section-label">まだタグがありません</span>`;
  }
  allTags.forEach((t) => {
    const c = document.createElement("span");
    c.className = "chip" + (state.selectedTags.includes(t) ? " active" : "");
    c.textContent = t;
    c.addEventListener("click", () => {
      state.selectedTags = state.selectedTags.includes(t)
        ? state.selectedTags.filter((x) => x !== t)
        : [...state.selectedTags, t];
      renderSearch();
    });
    tagWrap.appendChild(c);
  });

  // しぼり込み
  const result = state.recipes.filter((r) => {
    const kwOK = !state.keyword || (r.title || "").toLowerCase().includes(state.keyword);
    const tagOK = state.selectedTags.every((t) => (r.tags || []).includes(t));
    return kwOK && tagOK;
  });

  const list = $("search-list");
  list.innerHTML = "";
  $("search-empty").classList.toggle("hidden", result.length !== 0);
  result.forEach((r) => list.appendChild(recipeCard(r)));
}

/* ---------- 詳細 ---------- */
function openDetail(id) {
  const r = state.recipes.find((x) => x.id === id);
  if (!r) return;
  const tags = (r.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("");
  $("detail-body").innerHTML = `
    ${r.image_url
      ? `<img class="detail-img" src="${esc(r.image_url)}" alt="${esc(r.title)}" />`
      : `<div class="detail-noimg">🍽</div>`}
    <h2 class="detail-title">${esc(r.title)}</h2>
    <div class="detail-tags">${tags}</div>
    ${section("材料", r.ingredients)}
    ${section("手順", r.steps)}
    <div class="detail-actions">
      <button class="btn-danger" id="d-del">削除</button>
      <button class="btn-primary" id="d-edit">編集する</button>
    </div>`;
  $("d-edit").addEventListener("click", () => openForm(r));
  $("d-del").addEventListener("click", () => deleteRecipe(r));
  openSubview("detail", "レシピ");
}

function section(label, text) {
  if (!text || !text.trim()) return "";
  return `<div class="detail-section"><h3>${label}</h3><div class="detail-text">${esc(text)}</div></div>`;
}

/* ---------- フォーム（新規・編集） ---------- */
function openForm(recipe = null) {
  state.editing = recipe;
  state.pickedFile = null;
  state.removeImage = false;
  state.formTags = recipe ? [...(recipe.tags || [])] : [];

  $("f-title").value = recipe?.title || "";
  $("f-ingredients").value = recipe?.ingredients || "";
  $("f-steps").value = recipe?.steps || "";
  $("f-tag-input").value = "";

  const prev = $("f-image-preview");
  if (recipe?.image_url) {
    prev.style.backgroundImage = `url('${recipe.image_url}')`;
    prev.classList.add("has-img");
    $("f-image-clear").classList.remove("hidden");
  } else {
    prev.style.backgroundImage = "";
    prev.classList.remove("has-img");
    $("f-image-clear").classList.add("hidden");
  }

  renderFormTags();
  renderTagSuggest();
  openSubview("form", recipe ? "レシピを編集" : "新しいレシピ");
}

function onPickImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  state.pickedFile = file;
  state.removeImage = false;
  const url = URL.createObjectURL(file);
  const prev = $("f-image-preview");
  prev.style.backgroundImage = `url('${url}')`;
  prev.classList.add("has-img");
  $("f-image-clear").classList.remove("hidden");
}

function clearImage() {
  state.pickedFile = null;
  state.removeImage = true;
  $("f-image").value = "";
  const prev = $("f-image-preview");
  prev.style.backgroundImage = "";
  prev.classList.remove("has-img");
  $("f-image-clear").classList.add("hidden");
}

/* タグ操作 */
function addFormTag(raw) {
  raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((t) => {
    if (!state.formTags.includes(t)) state.formTags.push(t);
  });
  renderFormTags();
}
function removeFormTag(t) {
  state.formTags = state.formTags.filter((x) => x !== t);
  renderFormTags();
  renderTagSuggest();
}
function renderFormTags() {
  const wrap = $("tag-chips");
  wrap.innerHTML = "";
  state.formTags.forEach((t) => {
    const c = document.createElement("span");
    c.className = "chip active";
    c.innerHTML = `${esc(t)} <span class="x">×</span>`;
    c.addEventListener("click", () => removeFormTag(t));
    wrap.appendChild(c);
  });
}
function renderTagSuggest() {
  const typed = $("f-tag-input").value.trim().toLowerCase();
  const used = [...new Set(state.recipes.flatMap((r) => r.tags || []))];
  const cands = used
    .filter((t) => !state.formTags.includes(t))
    .filter((t) => !typed || t.toLowerCase().includes(typed))
    .slice(0, 8);
  const wrap = $("tag-suggest");
  wrap.innerHTML = "";
  cands.forEach((t) => {
    const c = document.createElement("span");
    c.className = "chip suggest";
    c.textContent = "＋ " + t;
    c.addEventListener("click", () => { addFormTag(t); renderTagSuggest(); });
    wrap.appendChild(c);
  });
}

/* ---------- 保存 ---------- */
async function saveRecipe(e) {
  e.preventDefault();
  const title = $("f-title").value.trim();
  if (!title) { toast("料理名を入力してください"); return; }

  showLoading(true);
  try {
    let imageUrl = state.editing?.image_url || null;

    // 画像の差し替え／削除
    if (state.pickedFile) {
      if (state.editing?.image_url) await deleteImageByUrl(state.editing.image_url);
      imageUrl = await uploadImage(state.pickedFile);
    } else if (state.removeImage && state.editing?.image_url) {
      await deleteImageByUrl(state.editing.image_url);
      imageUrl = null;
    }

    const payload = {
      user_id: state.user.id,
      title,
      ingredients: $("f-ingredients").value.trim() || null,
      steps: $("f-steps").value.trim() || null,
      tags: state.formTags,
      image_url: imageUrl,
    };

    let error;
    if (state.editing) {
      ({ error } = await supa.from("recipes").update(payload).eq("id", state.editing.id));
    } else {
      ({ error } = await supa.from("recipes").insert(payload));
    }
    if (error) throw error;

    await loadRecipes();
    showLoading(false);
    toast(state.editing ? "更新しました" : "保存しました");
    switchTab("home");
  } catch (err) {
    showLoading(false);
    toast("保存に失敗：" + (err.message || err));
  }
}

/* ---------- 削除 ---------- */
async function deleteRecipe(r) {
  if (!confirm(`「${r.title}」を削除しますか？\nこの操作は取り消せません。`)) return;
  showLoading(true);
  try {
    if (r.image_url) await deleteImageByUrl(r.image_url);
    const { error } = await supa.from("recipes").delete().eq("id", r.id);
    if (error) throw error;
    await loadRecipes();
    showLoading(false);
    toast("削除しました");
    switchTab("home");
  } catch (err) {
    showLoading(false);
    toast("削除に失敗：" + (err.message || err));
  }
}

/* ---------- 画像アップロード ---------- */
async function uploadImage(file) {
  const blob = await resizeImage(file, 1200, 0.85);
  const path = `${state.user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supa.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supa.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function deleteImageByUrl(url) {
  // 公開URLから保存パスを取り出して削除（失敗しても致命的ではない）
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return;
  const path = url.slice(i + marker.length).split("?")[0];
  try { await supa.storage.from(BUCKET).remove([path]); } catch (_) {}
}

// 画像を縮小してJPEGのBlobにする（保存容量と表示を軽くする）
function resizeImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("画像の変換に失敗しました"))),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- 小道具 ---------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function showLoading(on) { $("loading").classList.toggle("hidden", !on); }
let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2800);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
