const form = document.getElementById("dq-upload-form");
const fileInput = document.getElementById("datasetFile");
const apiStatus = document.getElementById("apiStatus");
const resultsSection = document.getElementById("resultsSection");
const summaryGrid = document.getElementById("summaryGrid");
const llmReportContent = document.getElementById("llmReportContent");
const findingsTableBody = document.querySelector("#findingsTable tbody");
const profilesTableBody = document.querySelector("#profilesTable tbody");
const downloadReportBtn = document.getElementById("downloadReportBtn");

let lastUploadedFile = null;

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function setStatus(message, type = "info") {
  apiStatus.textContent = message;
  apiStatus.className = `status-box status-${type}`;
}

function createSummaryCard(label, value) {
  return `
    <div class="summary-card">
      <div class="summary-label">${label}</div>
      <div class="summary-value">${value}</div>
    </div>
  `;
}

function renderSummary(data) {
  const { ingestion, profile, quality, llm_execution } = data;
  summaryGrid.innerHTML = [
    createSummaryCard("Filename", ingestion.metadata.filename),
    createSummaryCard("Format", ingestion.metadata.file_format),
    createSummaryCard("Rows", profile.row_count),
    createSummaryCard("Columns", profile.column_count),
    createSummaryCard("Quality Score", quality.quality_score),
    createSummaryCard("Quality Status", quality.quality_status),
    createSummaryCard(
      "Missing Cell Ratio",
      formatPercent(profile.missing_cell_ratio),
    ),
    createSummaryCard(
      "Duplicate Row Ratio",
      formatPercent(profile.duplicate_row_ratio),
    ),
    createSummaryCard("Total Findings", quality.total_findings),
    createSummaryCard("LLM Mode", llm_execution.mode),
  ].join("");
}

function renderLLMReport(data) {
  const { llm_report, llm_execution } = data;

  const topIssues = (llm_report.top_issues || [])
    .map((item) => `<li>${item}</li>`)
    .join("");

  const actions = (llm_report.recommended_actions || [])
    .map((item) => `<li>${item}</li>`)
    .join("");

  llmReportContent.innerHTML = `
    <p><strong>Summary:</strong> ${llm_report.summary}</p>
    <p><strong>Overall assessment:</strong> ${llm_report.overall_assessment}</p>

    <h4>Top issues</h4>
    <ul>${topIssues || "<li>No top issues returned.</li>"}</ul>

    <h4>Recommended actions</h4>
    <ul>${actions || "<li>No recommendations returned.</li>"}</ul>

    <p class="muted">
      Execution mode: <strong>${llm_execution.mode}</strong> ·
      Fallback used: <strong>${llm_execution.used_fallback}</strong> ·
      Model: <strong>${llm_execution.model_name || "N/A"}</strong>
    </p>
  `;
}

function renderFindings(data) {
  const rows = (data.findings || [])
    .map(
      (finding) => `
        <tr>
          <td><span class="badge badge-${finding.severity}">${finding.severity}</span></td>
          <td>${finding.finding_type}</td>
          <td>${finding.column || "-"}</td>
          <td>${finding.title}</td>
          <td>${finding.message}</td>
        </tr>
      `,
    )
    .join("");

  findingsTableBody.innerHTML =
    rows || `<tr><td colspan="5">No findings available.</td></tr>`;
}

function renderProfiles(data) {
  const rows = (data.profile.column_profiles || [])
    .map(
      (profile) => `
        <tr>
          <td>${profile.column}</td>
          <td>${profile.profile_type}</td>
          <td>${profile.inferred_logical_type}</td>
          <td>${formatPercent(profile.null_ratio)}</td>
          <td>${formatPercent(profile.unique_ratio)}</td>
          <td>${profile.is_constant ? "Yes" : "No"}</td>
        </tr>
      `,
    )
    .join("");

  profilesTableBody.innerHTML =
    rows || `<tr><td colspan="6">No column profiles available.</td></tr>`;
}

async function analyzeDataset(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${window.DQ_API_BASE_URL}/api/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = "Analysis failed.";
    try {
      const errorData = await response.json();
      message = errorData.detail || message;
    } catch (_) {}
    throw new Error(message);
  }

  return response.json();
}

async function downloadHtmlReport(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${window.DQ_API_BASE_URL}/api/analyze/report/html`,
    { method: "POST", body: formData },
  );

  if (!response.ok) {
    let message = "HTML report generation failed.";
    try {
      const errorData = await response.json();
      message = errorData.detail || message;
    } catch (_) {}
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dq-report.html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = fileInput.files[0];
  if (!file) {
    setStatus("Please select a CSV or Parquet file first.", "error");
    return;
  }

  lastUploadedFile = file;
  downloadReportBtn.disabled = true;
  resultsSection.classList.add("hidden");
  setStatus("Analyzing dataset...", "loading");

  try {
    const data = await analyzeDataset(file);
    renderSummary(data);
    renderLLMReport(data);
    renderFindings(data);
    renderProfiles(data);

    resultsSection.classList.remove("hidden");
    downloadReportBtn.disabled = false;
    setStatus("Analysis completed successfully.", "success");
  } catch (error) {
    setStatus(error.message || "Unexpected error during analysis.", "error");
  }
});

downloadReportBtn.addEventListener("click", async () => {
  if (!lastUploadedFile) {
    setStatus("Please analyze a file before downloading the report.", "error");
    return;
  }

  setStatus("Generating HTML report...", "loading");

  try {
    await downloadHtmlReport(lastUploadedFile);
    setStatus("HTML report downloaded successfully.", "success");
  } catch (error) {
    setStatus(
      error.message || "Unexpected error during report generation.",
      "error",
    );
  }
});
