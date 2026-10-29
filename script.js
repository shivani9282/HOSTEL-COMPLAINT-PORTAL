```javascript
"use strict";

/*
 * HostelCare - Frontend JavaScript
 *
 * Backend default: http://localhost:3000
 * Optional: define window.HOSTEL_API_BASE before this script loads.
 *
 * Expected API:
 * GET    /api/complaints
 * POST   /api/complaints
 *
 * The backend should return either an array of complaints or
 * an object containing a "complaints" array.
 */

const API_BASE = (
  window.HOSTEL_API_BASE || "http://localhost:3000/api"
).replace(/\/+$/, "");

const $ = (selector) => document.querySelector(selector);

const elements = {
  form: $("#complaintForm"),
  name: $("#studentName"),
  room: $("#roomNumber"),
  title: $("#complaintTitle"),
  category: $("#complaintCategory"),
  description: $("#complaintDescription"),
  descriptionCount: $("#descriptionCount"),
  submitButton: $("#submitButton"),
  submitButtonText: $("#submitButtonText"),
  submitSpinner: $("#submitSpinner"),
  formMessage: $("#formMessage"),
  notice: $("#notice"),
  complaintList: $("#complaintList"),
  resultCount: $("#resultCount"),
  search: $("#searchInput"),
  categoryFilter: $("#categoryFilter"),
  statusFilter: $("#statusFilter"),
  refreshButton: $("#refreshButton"),
  clearFiltersButton: $("#clearFiltersButton"),
  totalCount: $("#totalCount"),
  pendingCount: $("#pendingCount"),
  progressCount: $("#progressCount"),
  resolvedCount: $("#resolvedCount"),
  currentYear: $("#currentYear")
};

let complaints = [];
let loading = false;
let requestNumber = 0;
let noticeTimer = null;

// ---------- General helpers ----------

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function normalizeStatus(status) {
  const value = String(status || "pending")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (value === "in_progress" || value === "inprogress") {
    return "in_progress";
  }

  if (value === "resolved" || value === "completed") {
    return "resolved";
  }

  return "pending";
}

function statusLabel(status) {
  const labels = {
    pending: "Pending",
    in_progress: "In Progress",
    resolved: "Resolved"
  };

  return labels[normalizeStatus(status)];
}

function statusClass(status) {
  const classes = {
    pending: "status-pending",
    in_progress: "status-in-progress",
    resolved: "status-resolved"
  };

  return classes[normalizeStatus(status)];
}

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function getComplaintDate(complaint) {
  return (
    complaint.created_at ||
    complaint.createdAt ||
    complaint.date ||
    null
  );
}

function showMessage(element, message, type = "success") {
  if (!element) return;

  element.textContent = message;
  element.className = element.id === "notice"
    ? `notice ${type}`
    : `form-message ${type}`;

  element.hidden = false;
}

function hideMessage(element) {
  if (element) {
    element.hidden = true;
    element.textContent = "";
  }
}

function showNotice(message, type = "success") {
  clearTimeout(noticeTimer);
  showMessage(elements.notice, message, type);

  noticeTimer = setTimeout(() => {
    hideMessage(elements.notice);
  }, 6000);
}

async function apiRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new Error(
      "Unable to reach the backend. Check that the server is running at " +
      API_BASE + " and try again."
    );
  }

  const contentType = response.headers.get("content-type") || "";
  let data = null;

  if (contentType.includes("application/json")) {
    data = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => "");
    data = text ? { error: text } : null;
  }

  if (!response.ok) {
    const message =
      data?.error ||
      data?.message ||
      `The request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return data;
}

// ---------- Complaint data ----------

function extractComplaints(data) {
  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.complaints)) {
    return data.complaints;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  // An empty response is valid, but an unexpected object is not.
  if (data == null) return [];

  throw new Error(
    "The API returned an unexpected response. Check GET /api/complaints."
  );
}

function getCategory(complaint) {
  return String(complaint.category || "Other");
}

function getTitle(complaint) {
  return String(
    complaint.title ||
    complaint.subject ||
    "Untitled complaint"
  );
}

function getDescription(complaint) {
  return String(complaint.description || "");
}

function getStudentName(complaint) {
  return String(
    complaint.student_name ||
    complaint.studentName ||
    complaint.name ||
    "Student"
  );
}

function getRoomNumber(complaint) {
  return String(
    complaint.room_number ||
    complaint.roomNumber ||
    complaint.room_no ||
    ""
  );
}

function updateStatistics() {
  const counts = {
    total: complaints.length,
    pending: 0,
    in_progress: 0,
    resolved: 0
  };

  complaints.forEach((complaint) => {
    counts[normalizeStatus(complaint.status)]++;
  });

  elements.totalCount.textContent = counts.total;
  elements.pendingCount.textContent = counts.pending;
  elements.progressCount.textContent = counts.in_progress;
  elements.resolvedCount.textContent = counts.resolved;
}

async function loadComplaints(options = {}) {
  const currentRequest = ++requestNumber;
  loading = true;

  if (options.showLoading !== false) {
    elements.complaintList.innerHTML = `
      <div class="loading-state">
        <span class="spinner" aria-hidden="true"></span>
        Loading complaints...
      </div>
    `;

    elements.resultCount.textContent = "Loading complaints...";
  }

  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = "Loading...";

  try {
    const data = await apiRequest("/complaints");

    // Ignore a stale response if a newer request has started.
    if (currentRequest !== requestNumber) return;

    complaints = extractComplaints(data);
    updateStatistics();
    renderComplaints();
  } catch (error) {
    if (currentRequest !== requestNumber) return;

    elements.complaintList.innerHTML = `
      <div class="error-state">
        <h3>Couldn't load complaints</h3>
        <p>${escapeHTML(error.message)}</p>
        <p style="margin-top:12px">
          Check your backend and Supabase configuration, then refresh.
        </p>
      </div>
    `;

    elements.resultCount.textContent = "Unable to load complaints";
    updateStatisticsWithUnavailableState();
    showNotice(error.message, "error");
  } finally {
    if (currentRequest === requestNumber) {
      loading = false;
      elements.refreshButton.disabled = false;
      elements.refreshButton.innerHTML = "↻ Refresh";
    }
  }
}

function updateStatisticsWithUnavailableState() {
  elements.totalCount.textContent = "—";
  elements.pendingCount.textContent = "—";
  elements.progressCount.textContent = "—";
  elements.resolvedCount.textContent = "—";
}

// ---------- Search and filtering ----------

function getFilteredComplaints() {
  const query = elements.search.value.trim().toLowerCase();
  const category = elements.categoryFilter.value.toLowerCase();
  const status = elements.statusFilter.value;

  return complaints.filter((complaint) => {
    const searchableText = [
      getTitle(complaint),
      getDescription(complaint),
      getCategory(complaint),
      getStudentName(complaint),
      getRoomNumber(complaint)
    ].join(" ").toLowerCase();

    const matchesSearch = !query || searchableText.includes(query);

    const matchesCategory =
      !category || getCategory(complaint).toLowerCase() === category;

    const matchesStatus =
      !status || normalizeStatus(complaint.status) === status;

    return matchesSearch && matchesCategory && matchesStatus;
  });
}

function renderComplaints() {
  const filtered = getFilteredComplaints();

  elements.resultCount.textContent =
    `${filtered.length} complaint${filtered.length === 1 ? "" : "s"} found`;

  if (filtered.length === 0) {
    const hasFilters =
      elements.search.value.trim() ||
      elements.categoryFilter.value ||
      elements.statusFilter.value;

    elements.complaintList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">⌕</div>
        <h3>${hasFilters ? "No matching complaints" : "No complaints yet"}</h3>
        <p>${
          hasFilters
            ? "Try changing your search or clearing the filters."
            : "Be the first to report an issue using the form below."
        }</p>
      </div>
    `;

    return;
  }

  elements.complaintList.innerHTML = filtered
    .map(createComplaintCard)
    .join("");
}

function createComplaintCard(complaint) {
  const category = getCategory(complaint);
  const title = getTitle(complaint);
  const description = getDescription(complaint);
  const status = normalizeStatus(complaint.status);
  const date = formatDate(getComplaintDate(complaint));
  const student = getStudentName(complaint);
  const room = getRoomNumber(complaint);

  const metadata = [
    `<span aria-label="Student">♙ ${escapeHTML(student)}</span>`,
    room
      ? `<span aria-label="Room number">⌂ ${escapeHTML(room)}</span>`
      : ""
  ].filter(Boolean).join("");

  return `
    <article class="complaint-card">
      <div class="complaint-main">
        <div class="complaint-topline">
          <span class="category-chip">${escapeHTML(category)}</span>
          <span class="complaint-date">${escapeHTML(date)}</span>
        </div>

        <h3>${escapeHTML(title)}</h3>
        <p class="complaint-description">${escapeHTML(description)}</p>

        <div class="complaint-meta">
          ${metadata}
        </div>
      </div>

      <span class="status-badge ${statusClass(status)}">
        ${escapeHTML(statusLabel(status))}
      </span>
    </article>
  `;
}

// ---------- Complaint submission ----------

function setSubmitting(isSubmitting) {
  elements.submitButton.disabled = isSubmitting;
  elements.submitButtonText.textContent = isSubmitting
    ? "Submitting..."
    : "Submit Complaint →";

  elements.submitSpinner.hidden = !isSubmitting;
}

function updateDescriptionCount() {
  elements.descriptionCount.textContent =
    elements.description.value.length;
}

async function submitComplaint(event) {
  event.preventDefault();
  hideMessage(elements.formMessage);

  if (loading) {
    showMessage(
      elements.formMessage,
      "Please wait for the current request to finish.",
      "error"
    );
    return;
  }

  if (!elements.form.reportValidity()) {
    return;
  }

  const payload = {
    student_name: elements.name.value.trim(),
    room_number: elements.room.value.trim(),
    title: elements.title.value.trim(),
    category: elements.category.value,
    description: elements.description.value.trim()
  };

  if (payload.student_name.length < 2) {
    showMessage(
      elements.formMessage,
      "Please enter a valid student name.",
      "error"
    );
    elements.name.focus();
    return;
  }

  if (!payload.room_number) {
    showMessage(
      elements.formMessage,
      "Please enter your room number.",
      "error"
    );
    elements.room.focus();
    return;
  }

  if (payload.title.length < 5) {
    showMessage(
      elements.formMessage,
      "The complaint title must contain at least 5 characters.",
      "error"
    );
    elements.title.focus();
    return;
  }

  if (payload.description.length < 10) {
    showMessage(
      elements.formMessage,
      "Please describe the issue in at least 10 characters.",
      "error"
    );
    elements.description.focus();
    return;
  }

  setSubmitting(true);

  try {
    await apiRequest("/complaints", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    elements.form.reset();
    updateDescriptionCount();

    showMessage(
      elements.formMessage,
      "Your complaint was submitted successfully!",
      "success"
    );

    await loadComplaints({ showLoading: false });

    // Bring the updated complaint dashboard into view.
    $("#complaints").scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start"
    });
  } catch (error) {
    showMessage(
      elements.formMessage,
      error.message || "Unable to submit your complaint. Please try again.",
      "error"
    );
  } finally {
    setSubmitting(false);
  }
}

// ---------- Event listeners ----------

function clearFilters() {
  elements.search.value = "";
  elements.categoryFilter.value = "";
  elements.statusFilter.value = "";
  renderComplaints();
}

function initializeApp() {
  elements.currentYear.textContent = new Date().getFullYear();

  elements.form.addEventListener("submit", submitComplaint);

  elements.description.addEventListener(
    "input",
    updateDescriptionCount
  );

  elements.search.addEventListener("input", renderComplaints);
  elements.categoryFilter.addEventListener("change", renderComplaints);
  elements.statusFilter.addEventListener("change", renderComplaints);

  elements.refreshButton.addEventListener("click", () => {
    loadComplaints();
  });

  elements.clearFiltersButton.addEventListener("click", clearFilters);

  // Load actual complaints from the backend.
  loadComplaints();
}

document.addEventListener("DOMContentLoaded", initializeApp);
```