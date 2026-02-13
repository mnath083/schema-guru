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

function createParagraph(text, className = "") {
  const p = document.createElement("p");
  if (className) {
    p.className = className;
  }
  p.textContent = text;
  return p;
}

function renderCompatible() {
  const badge = createParagraph("Compatible", "badge badge-ok");
  const message = createParagraph("No compatibility errors found.");
  summary.appendChild(badge);
  summary.appendChild(message);
}

function renderErrors(data) {
  const totalErrors = typeof data.totalErrors === "number" ? data.totalErrors : (data.errors || []).length;

  const badge = createParagraph("Incompatible", "badge badge-bad");
  const total = document.createElement("p");
  total.append("Total Errors: ");
  const strong = document.createElement("strong");
  strong.textContent = String(totalErrors);
  total.appendChild(strong);
  summary.appendChild(badge);
  summary.appendChild(total);

  (data.errors || []).forEach((err, index) => {
    const wrapper = document.createElement("details");
    wrapper.className = "error-card";
    if (index < 2) {
      wrapper.open = true;
    }

    const summaryEl = document.createElement("summary");

    const issueSpan = document.createElement("span");
    issueSpan.className = "issue";
    issueSpan.textContent = err.issueType || "UNKNOWN";

    const pathSpan = document.createElement("span");
    pathSpan.className = "path";
    pathSpan.textContent = err.path || "unknown path";

    summaryEl.appendChild(issueSpan);
    summaryEl.appendChild(pathSpan);
    wrapper.appendChild(summaryEl);

    const body = document.createElement("div");
    body.className = "error-body";

    const description = document.createElement("p");
    const descriptionStrong = document.createElement("strong");
    descriptionStrong.textContent = "Description:";
    description.appendChild(descriptionStrong);
    description.append(` ${err.description || ""}`);

    const writer = document.createElement("p");
    const writerStrong = document.createElement("strong");
    writerStrong.textContent = "Writer Type:";
    const writerCode = document.createElement("code");
    writerCode.textContent = err.writerType || "unknown";
    writer.appendChild(writerStrong);
    writer.append(" ");
    writer.appendChild(writerCode);

    const reader = document.createElement("p");
    const readerStrong = document.createElement("strong");
    readerStrong.textContent = "Reader Type:";
    const readerCode = document.createElement("code");
    readerCode.textContent = err.readerType || "unknown";
    reader.appendChild(readerStrong);
    reader.append(" ");
    reader.appendChild(readerCode);

    body.appendChild(description);
    body.appendChild(writer);
    body.appendChild(reader);

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
  summary.appendChild(createParagraph("Running compatibility checks..."));

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
