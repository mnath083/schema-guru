const form = document.getElementById("compare-form");
const compareButton = document.getElementById("compare-button");
const resultSection = document.getElementById("result-section");
const summary = document.getElementById("result-summary");
const errorList = document.getElementById("error-list");
const toggleRawButton = document.getElementById("toggle-raw-button");
const rawJson = document.getElementById("raw-json");

function clearResults() {
  summary.innerHTML = "";
  errorList.innerHTML = "";
  rawJson.textContent = "";
  rawJson.classList.add("hidden");
  toggleRawButton.textContent = "Show Raw JSON";
}

function renderCompatible() {
  summary.innerHTML = '<p class="badge badge-ok">Compatible</p><p>No compatibility errors found.</p>';
}

function renderErrors(data) {
  const totalErrors = typeof data.totalErrors === "number" ? data.totalErrors : (data.errors || []).length;
  summary.innerHTML = `<p class="badge badge-bad">Incompatible</p><p>Total Errors: <strong>${totalErrors}</strong></p>`;

  (data.errors || []).forEach((err, index) => {
    const wrapper = document.createElement("details");
    wrapper.className = "error-card";
    if (index < 2) {
      wrapper.open = true;
    }

    const summaryEl = document.createElement("summary");
    summaryEl.innerHTML = `<span class="issue">${err.issueType || "UNKNOWN"}</span> <span class="path">${err.path || "unknown path"}</span>`;
    wrapper.appendChild(summaryEl);

    const body = document.createElement("div");
    body.className = "error-body";
    body.innerHTML = `
      <p><strong>Description:</strong> ${err.description || ""}</p>
      <p><strong>Writer Type:</strong> <code>${err.writerType || "unknown"}</code></p>
      <p><strong>Reader Type:</strong> <code>${err.readerType || "unknown"}</code></p>
    `;
    wrapper.appendChild(body);
    errorList.appendChild(wrapper);
  });
}

function renderData(data) {
  if (data.compatible) {
    renderCompatible();
  } else {
    renderErrors(data);
  }
  rawJson.textContent = JSON.stringify(data, null, 2);
}

toggleRawButton.addEventListener("click", () => {
  const hidden = rawJson.classList.contains("hidden");
  if (hidden) {
    rawJson.classList.remove("hidden");
    toggleRawButton.textContent = "Hide Raw JSON";
  } else {
    rawJson.classList.add("hidden");
    toggleRawButton.textContent = "Show Raw JSON";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  compareButton.disabled = true;
  compareButton.textContent = "Comparing...";
  resultSection.classList.remove("hidden");
  clearResults();
  summary.innerHTML = "<p>Running compatibility checks...</p>";

  try {
    const response = await fetch("/compare", {
      method: "POST",
      body: new FormData(form),
    });
    const data = await response.json();
    renderData(data);
  } catch (error) {
    renderData({
      compatible: false,
      totalErrors: 1,
      errors: [
        {
          path: "request",
          issueType: "REQUEST_FAILED",
          writerType: "client",
          readerType: "server",
          description: String(error),
        },
      ],
    });
  } finally {
    compareButton.disabled = false;
    compareButton.textContent = "Compare";
  }
});

