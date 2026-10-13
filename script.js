
const donorForm = document.querySelector("#donorForm");
const searchForm = document.querySelector("#searchForm");
const donorResults = document.querySelector("#donorResults");
const formMessage = document.querySelector("#formMessage");
const searchMessage = document.querySelector("#searchMessage");
const donorCount = document.querySelector("#donorCount");
const menuToggle = document.querySelector("#menuToggle");
const nav = document.querySelector("#nav");

menuToggle.addEventListener("click", () => {
  nav.classList.toggle("open");
});

nav.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => nav.classList.remove("open"));
});

function showMessage(element, message, type) {
  element.textContent = message;
  element.className = `message ${type}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
}

// Prevent user-provided text from being interpreted as HTML.
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function renderDonors(donors) {
  if (!donors.length) {
    donorResults.innerHTML =
      '<div class="empty-state">No matching donors found. Try another blood group or city.</div>';
    return;
  }

  donorResults.innerHTML = donors.map(d => `
    <article class="donor-card">
      <div class="donor-blood">${escapeHtml(d.bloodGroup)}</div>
      <div class="donor-info">
        <h3>${escapeHtml(d.name)}</h3>
        <p>⌖ ${escapeHtml(d.city)} · Registered donor</p>
        <span class="donor-status">● Registered</span>
      </div>
    </article>
  `).join("");
}

async function loadStats() {
  try {
    const stats = await api("/api/stats");
    donorCount.textContent =
      Number(stats.donors || 0).toLocaleString("en-IN");
  } catch {
    donorCount.textContent = "—";
  }
}

// Register a new donor.
donorForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!donorForm.reportValidity()) return;

  const button = document.querySelector("#registerButton");
  const formData = new FormData(donorForm);
  const payload = Object.fromEntries(formData.entries());

  payload.consent = formData.get("consent") === "on";

  button.disabled = true;
  button.textContent = "Registering…";

  try {
    const result = await api("/api/donors", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    showMessage(
      formMessage,
      result.message || "Registration successful!",
      "success"
    );

    donorForm.reset();
    await loadStats();

    // Show the newly registered donor in search results.
    document.querySelector("#searchGroup").value =
      payload.bloodGroup;

    document.querySelector("#searchCity").value =
      payload.city;

    await searchDonors();

  } catch (error) {
    showMessage(formMessage, error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML =
      'Register as a donor <span>→</span>';
  }
});

// Search donors by blood group and city.
async function searchDonors() {
  const group = document.querySelector("#searchGroup").value;
  const city = document.querySelector("#searchCity").value.trim();

  const params = new URLSearchParams();

  if (group) params.set("bloodGroup", group);
  if (city) params.set("city", city);

  try {
    const data = await api(`/api/donors?${params.toString()}`);

    renderDonors(data.donors || []);

    showMessage(
      searchMessage,
      `${data.donors.length} matching donor(s) found.`,
      "success"
    );
  } catch (error) {
    showMessage(searchMessage, error.message, "error");

    donorResults.innerHTML =
      '<div class="empty-state">Could not load donors. Check whether the server is running.</div>';
  }
}

searchForm.addEventListener("submit", event => {
  event.preventDefault();
  searchDonors();
});

// Initial dashboard count.
loadStats();
