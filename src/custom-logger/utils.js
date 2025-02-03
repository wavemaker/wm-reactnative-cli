const syncSteps = [
  {
    step: 1,
    start: "Setting up directories",
    stop : "",
    succeed : "Setup directories finished",
    fail : "Setup directories failed",
    info : "",
    warn : "",
  },
  {
    step: 2,
    start: "Authenticating user",
    stop : "",
    succeed : "Authentication successful",
    fail : "Authentication failed",
    info : "",
    warn : "",
  },
  {
    step: 3,
    start: "Downloading project",
    stop : "",
    succeed : "Project downloaded",
    fail : "Project download failed",
    info : "",
    warn : "",
  },
  {
    step: 4,
    start: "Transpiling project",
    stop : "",
    succeed : "Project transpiled successfully",
    fail : "Transpiling project failed",
    info : "",
    warn : "",
  },
  {
    step: 5,
    start: "Installing dependencies",
    stop : "",
    succeed : "Dependencies installed",
    fail : "Dependencies installation failed",
    info : "",
    warn : "",
  },
]

const buildSteps = [
  {
    step: 1,
    start: "Initializing project structure...",
    stop: "",
    succeed: "Project directories successfully set up.",
    fail: "Failed to set up project directories.",
    info: "",
    warn: "",
  },
  {
    step: 2,
    start: "Verifying prerequisites...",
    stop: "",
    succeed: "All required prerequisites are met.",
    fail: "Missing or incompatible prerequisites detected.",
    info: "",
    warn: "",
  },
  {
    step: 3,
    start: "Installing dependencies...",
    stop: "",
    succeed: "All dependencies installed successfully.",
    fail: "Dependency installation failed.",
    info: "",
    warn: "",
  },
  {
    step: 4,
    start: "Ejecting project configuration...",
    stop: "",
    succeed: "Project ejected successfully.",
    fail: "Project ejection failed.",
    info: "",
    warn: "",
  },
  {
    step: 5,
    start: "Building Android/iOS application...",
    stop: "",
    succeed: "Build successful! APK/IPA generated.",
    fail: "Build failed! Error generating APK/IPA.",
    info: "",
    warn: "",
  },
];



module.exports={
  syncSteps
}