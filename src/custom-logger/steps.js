const previewSteps = [
  {
    step: 1,
    start: "Setting up directories",
    stop: "",
    succeed: "Setup directories finished",
    fail: "Setup directories failed",
    info: "",
    warn: "",
    total: 1,
  },
  {
    step: 2,
    start: "Authenticating user",
    stop: "",
    succeed: "Authentication successful",
    fail: "Authentication failed",
    info: "",
    warn: "",
    total: 1,
  },
  {
    step: 3,
    start: "Downloading project",
    stop: "",
    succeed: "Project downloaded",
    fail: "Project download failed",
    info: "",
    warn: "",
    total: 5
  },
  {
    step: 4,
    start: "Transpiling project",
    stop: "",
    succeed: "Project transpiled successfully",
    fail: "Transpiling project failed",
    info: "",
    warn: "",
    total: 6
  },
  {
    step: 5,
    start: "Installing dependencies",
    stop: "",
    succeed: "Dependencies installed",
    fail: "Dependencies installation failed",
    info: "",
    warn: "",
    total: 4
  },
];


const androidBuildSteps = [
  {
    step: 1,
    start: "Setting up build directories",
    stop: "",
    succeed: "Project directories successfully set up.",
    fail: "Failed to set up project directories.",
    info: "",
    warn: "",
    total: 6
  },
  {
    step: 2,
    start: "Verifying prerequisites...",
    stop: "",
    succeed: "All required prerequisites are met.",
    fail: "Missing or incompatible prerequisites detected.",
    info: "",
    warn: "",
    total: 2
  },
  {
    step: 3,
    start: "Installing dependencies...",
    stop: "",
    succeed: "All dependencies installed successfully.",
    fail: "Dependency installation failed.",
    info: "",
    warn: "",
    total: 4
  },
  {
    step: 4,
    start: "Ejecting project configuration...",
    stop: "",
    succeed: "Project ejected successfully.",
    fail: "Project ejection failed.",
    info: "",
    warn: "",
    total: 2
  },
  {
    step: 5,
    start: "Generating Artifact...",
    stop: "",
    succeed: "Build successful! APK/IPA generated.",
    fail: "Build failed! Error generating APK/IPA.",
    info: "",
    warn: "",
    total: 2,
  },
];


function calculateTotalSteps(process){
    return process.reduce((sum, step) => sum + (step.total || 0), 0);
}

module.exports={
  previewSteps,
  androidBuildSteps,
  calculateTotalSteps
}