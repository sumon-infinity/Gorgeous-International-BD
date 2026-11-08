const business = window.GORGEOUS;
const find = (selector) => document.querySelector(selector);
const filters = find("#filters");
const enquiry = find("#enquiry");
const listingForm = find("#listing-form");
const dialog = find("#property-dialog");
let listings = [];
let saved = readSaved();
let api;
let db;
let auth;
let identity;
let isAdmin = false;
let listingError = false;
let busy = false;
let language = "en";

function readSaved() {
  try {
    const value = JSON.parse(localStorage.getItem("gorgeous-saved") || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function element(tag, content) {
  const node = document.createElement(tag);
  if (content != null) node.textContent = content;
  return node;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function link(label, url) {
  const node = element("a", label);
  node.href = url;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  return node;
}

function button(label, action, style = "outline") {
  const node = element("button", label);
  node.type = "button";
  node.className = `button ${style}`;
  node.addEventListener("click", action);
  return node;
}

function whatsapp(message = "") {
  return `https://wa.me/${business.whatsapp}${message ? "?text=" + encodeURIComponent(message) : ""}`;
}

const priceFormat = new Intl.NumberFormat("en-BD");
function price(listing) {
  return listing.price ? `৳${priceFormat.format(listing.price)}${listing.purpose === "Rent" ? " / month" : ""}` : "Ask for price";
}

function photo(listing) {
  const url = safeUrl(listing.photoUrl);
  if (!url) return null;
  const img = element("img");
  img.src = url;
  img.alt = listing.title;
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => img.remove(), { once: true });
  return img;
}

function render() {
  const form = new FormData(filters);
  const query = form.get("query").trim().toLowerCase();
  const maximum = Number(form.get("maximum"));
  const matches = listings.filter((item) =>
    (!form.get("type") || item.type === form.get("type")) &&
    (!form.get("purpose") || item.purpose === form.get("purpose")) &&
    (!maximum || (item.price > 0 && item.price <= maximum)) &&
    [item.title, item.location, item.description, item.units].join(" ").toLowerCase().includes(query)
  );
  find("#listings").replaceChildren(...matches.map(card));
  find("#listing-status").textContent = busy ? "Loading properties…" : listingError ? "Properties could not be loaded. Contact us for availability." :
    matches.length ? `${matches.length} ${matches.length === 1 ? "property" : "properties"} found` :
      listings.length ? "No properties match these filters." : "There are currently no published listings.";
  find("#empty").hidden = busy || matches.length > 0;
  const savedList = listings.filter((item) => saved.has(item.id));
  find("#saved").replaceChildren(element("h3", "Saved on this device"), ...(savedList.length ?
    savedList.map((item) => button(item.title, () => details(item))) : [element("p", "Save a property from the listings to find it here.")]));
  find("#admin-list").replaceChildren(...(isAdmin ? listings.map((item) => button(`Edit ${item.title}`, () => edit(item))) : []));
}

function card(listing) {
  const card = element("article");
  const image = photo(listing);
  if (image) card.append(image);
  card.append(element("p", `${listing.type} · For ${listing.purpose === "Buy" ? "sale" : "rent"}`), element("h3", listing.title),
    element("p", `${listing.location}${listing.units ? " · " + listing.units : ""}`), element("p", price(listing)),
    button("View property", () => details(listing), ""),
    button(saved.has(listing.id) ? "Remove from saved" : "Save", () => {
      if (saved.has(listing.id)) saved.delete(listing.id);
      else saved.add(listing.id);
      try { localStorage.setItem("gorgeous-saved", JSON.stringify([...saved])); } catch {}
      render();
      [...find("#listings").children].find((item) => item.querySelector("h3").textContent === listing.title)?.lastElementChild.focus();
    }));
  return card;
}

function details(listing) {
  const content = find("#property-detail");
  const url = new URL(location.href);
  url.searchParams.set("property", listing.id);
  url.hash = "properties";
  content.replaceChildren(element("h3", listing.title), element("p", `${listing.location} · ${price(listing)}`));
  const image = photo(listing);
  if (image) content.append(image);
  content.append(element("p", listing.description),
    link("View area on Google Maps ↗", `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing.location + ", Bangladesh")}`),
    link("Ask on WhatsApp ↗", whatsapp(`Hello, I’m interested in ${listing.title} (reference ${listing.id}).`)),
    link("Share on Facebook ↗", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`));
  const source = safeUrl(listing.propertyLink);
  if (source) content.append(link("Original listing ↗", source));
  content.append(button("Request a viewing", () => {
    dialog.close();
    enquiry.elements.topic.value = "Request a viewing";
    enquiry.elements.property.value = listing.id;
    location.hash = "contact";
    enquiry.elements.name.focus();
  }));
  if (!dialog.open) dialog.showModal();
}

function edit(listing) {
  for (const input of listingForm.elements) {
    if (input.name) input.value = listing[input.name] ?? "";
  }
  find("#remove-listing").hidden = false;
  listingForm.elements.title.focus();
}

async function loadListings() {
  if (!db) return;
  busy = true;
  render();
  try {
    const results = await api.getDocs(api.collection(db, "gorgeousListings"));
    listings = results.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    listings.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    listingError = false;
  } catch {
    listingError = true;
  } finally {
    busy = false;
    render();
  }
}

async function connect() {
  if (!business.firebase.projectId) {
    find("#login").hidden = true;
    find("#admin-status").textContent = "The agency dashboard requires a Firebase project.";
    return;
  }
  const root = "https://www.gstatic.com/firebasejs/10.12.4/";
  try {
    const [app, firestore, authentication] = await Promise.all([
      import(root + "firebase-app.js"), import(root + "firebase-firestore.js"), import(root + "firebase-auth.js")
    ]);
    const instance = app.initializeApp(business.firebase);
    api = firestore;
    identity = authentication;
    db = api.getFirestore(instance);
    auth = identity.getAuth(instance);
    identity.onIdTokenChanged(auth, async (user) => {
      const token = user && await user.getIdTokenResult().catch(() => null);
      if (auth.currentUser !== user) return;
      isAdmin = token?.claims.admin === true;
      find("#admin").hidden = !isAdmin;
      find("#login").hidden = Boolean(user);
      find("#logout").hidden = !user;
      find("#admin-status").textContent = user ? (isAdmin ? `Signed in as ${user.email}` : "This account has no agency permissions.") : "";
      find("#inbox").replaceChildren();
      listingForm.reset();
      render();
    });
    find("#enquiry-submit").textContent = "Send enquiry";
    await loadListings();
    const selected = listings.find((item) => item.id === new URLSearchParams(location.search).get("property"));
    if (selected) details(selected);
  } catch {
    find("#admin-status").textContent = "Firebase is unavailable. Try again later.";
  }
}

filters.addEventListener("submit", (event) => { event.preventDefault(); render(); });
document.querySelectorAll("[data-category]").forEach((node) => node.addEventListener("click", () => {
  filters.reset();
  filters.elements.type.value = node.dataset.category;
  render();
}));
document.querySelectorAll("[data-link]").forEach((node) => {
  const type = node.dataset.link;
  node.href = type === "telephone" ? `tel:${business.telephone}` : type === "whatsapp" ? whatsapp() : business[type];
  if (node.hasAttribute("data-phone")) node.textContent = business.phone;
});
find("#language").addEventListener("click", (event) => {
  language = language === "en" ? "bn" : "en";
  event.currentTarget.textContent = language === "en" ? "বাংলা" : "English";
  event.currentTarget.lang = language === "en" ? "bn" : "en";
  document.querySelectorAll("[data-bn]").forEach((node) => {
    node.textContent = node.dataset[language];
    node.lang = language;
  });
});
find("#owner-link").addEventListener("click", () => { enquiry.elements.topic.value = "Submit a property"; });
find("#close-dialog").addEventListener("click", () => dialog.close());
enquiry.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries([...new FormData(enquiry)].map(([key, value]) => [key, value.trim()]));
  const status = find("#enquiry-status");
  if (!data.name || !data.contact || !data.message) {
    status.textContent = "Enter your name, contact details and message.";
    return;
  }
  const message = [data.topic, data.property && `Property: ${data.property}`, data.name, data.contact, data.message].filter(Boolean).join("\n");
  if (!db) {
    location.assign(whatsapp(message));
    return;
  }
  const submit = find("#enquiry-submit");
  submit.disabled = true;
  try {
    await api.addDoc(api.collection(db, "gorgeousEnquiries"), { ...data, createdAt: api.serverTimestamp() });
    status.textContent = "Your enquiry was sent.";
    enquiry.reset();
  } catch {
    status.replaceChildren("Enquiry could not be sent. ", link("Send it on WhatsApp ↗", whatsapp(message)));
  } finally {
    submit.disabled = false;
  }
});
find("#login").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!auth) return;
  const form = event.currentTarget;
  const values = new FormData(form);
  try {
    await identity.signInWithEmailAndPassword(auth, values.get("email"), values.get("password"));
    form.reset();
  } catch {
    find("#admin-status").textContent = "Sign-in failed. Check your credentials and try again.";
  }
});
find("#logout").addEventListener("click", () => identity.signOut(auth));
listingForm.addEventListener("reset", () => { find("#remove-listing").hidden = true; });
listingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdmin) return;
  const { id, ...data } = Object.fromEntries(new FormData(listingForm));
  for (const key of Object.keys(data)) data[key] = data[key].trim();
  const status = find("#admin-status");
  if (!data.title || !data.location || !data.description || [data.photoUrl, data.propertyLink].some((url) => url && !safeUrl(url))) {
    status.textContent = "Enter a title, area and description. Use HTTPS for links.";
    return;
  }
  data.price = Number(data.price);
  data.updatedAt = new Date().toISOString();
  const submit = listingForm.querySelector("[type=submit]");
  submit.disabled = true;
  try {
    if (id) await api.setDoc(api.doc(db, "gorgeousListings", id), data);
    else await api.addDoc(api.collection(db, "gorgeousListings"), data);
    listingForm.reset();
    await loadListings();
    status.textContent = "Listing published.";
  } catch {
    status.textContent = "The listing could not be saved.";
  } finally {
    submit.disabled = false;
  }
});
find("#remove-listing").addEventListener("click", async () => {
  const id = listingForm.elements.id.value;
  if (!isAdmin || !id || !confirm("Remove this listing from the website?")) return;
  try {
    await api.deleteDoc(api.doc(db, "gorgeousListings", id));
    listingForm.reset();
    await loadListings();
    find("#admin-status").textContent = "Listing removed.";
  } catch {
    find("#admin-status").textContent = "The listing could not be removed.";
  }
});
find("#refresh").addEventListener("click", async () => {
  if (!isAdmin) return;
  const user = auth.currentUser;
  const inbox = find("#inbox");
  try {
    const results = await api.getDocs(api.query(api.collection(db, "gorgeousEnquiries"), api.orderBy("createdAt", "desc"), api.limit(100)));
    if (!isAdmin || user !== auth.currentUser) return;
    inbox.replaceChildren(...results.docs.map((doc) => {
      const data = doc.data();
      const entry = element("article");
      entry.append(element("h4", `${data.topic} · ${data.name}`), element("p", data.contact),
        element("p", data.message), element("p", data.property ? `Property: ${data.property}` : ""));
      return entry;
    }));
    if (results.empty) inbox.textContent = "No enquiries yet.";
  } catch {
    if (isAdmin && user === auth.currentUser) inbox.textContent = "Could not load enquiries.";
  }
});

render();
connect();
