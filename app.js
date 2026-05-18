const supabaseUrl = "https://yjiciqqddrmliqedepkm.supabase.co";
const supabaseAnonKey = "sb_publishable_ytF7_AiIXmw-uWCcdK17ng_pJo68ZMz";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);
const PHOTO_BUCKET = "patient-photos";

const TASK_IDS = ["task1", "task2", "task3", "task4", "task5"];
const taskLabels = {
  task1: "Access Cavity & Pulp Removal",
  task2: "Working Length Determination",
  task3: "Cleaning & Shaping",
  task4: "Obturation",
  task5: "Filling",
};

const page = document.body.dataset.page;
let currentUser = null;
let patientChannel = null;
let currentPatient = null;
let listPatients = [];
let listFilter = "active";
let listSearch = "";

function applyToothSelection(picker, position, number) {
  if (!picker) {
    return;
  }

  const positionInput = document.getElementById(picker.dataset.positionId);
  const numberInput = document.getElementById(picker.dataset.numberId);
  if (positionInput) {
    positionInput.value = position || "";
  }
  if (numberInput) {
    numberInput.value = number || "";
  }

  picker.querySelectorAll(".tooth-btn").forEach((button) => {
    const isSelected =
      button.dataset.position === position && button.dataset.number === number;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });

  const preview = picker.querySelector("[data-tooth-preview]");
  if (preview) {
    preview.textContent = `Selected: ${formatTooth(position, number)}`;
  }
}

function initToothPickers() {
  document.querySelectorAll(".tooth-picker").forEach((picker) => {
    if (picker.dataset.bound === "true") {
      return;
    }

    picker.addEventListener("click", (event) => {
      const button = event.target.closest(".tooth-btn");
      if (!button) {
        return;
      }

      applyToothSelection(
        picker,
        button.dataset.position,
        button.dataset.number,
      );
    });

    const positionInput = document.getElementById(picker.dataset.positionId);
    const numberInput = document.getElementById(picker.dataset.numberId);
    applyToothSelection(
      picker,
      positionInput?.value || "",
      numberInput?.value || "",
    );

    picker.dataset.bound = "true";
  });
}

function syncToothPicker(positionId, numberId) {
  const picker = document.querySelector(
    `.tooth-picker[data-position-id="${positionId}"]`,
  );
  if (!picker) {
    return;
  }

  const position = document.getElementById(positionId)?.value || "";
  const number = document.getElementById(numberId)?.value || "";
  applyToothSelection(picker, position, number);
}

function setFormError(id, message) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = message || "";
  }
}

function setStatusText(id, message) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = message || "";
  }
}

function formatAppointment(appointmentAt) {
  if (!appointmentAt) {
    return "Not set";
  }

  const date = new Date(appointmentAt);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${day}/${month}/${year}, ${hours}:${minutes} ${period}`;
}

function toLocalDatetimeValue(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatTooth(position, number) {
  const map = {
    UR: "Upper right",
    UL: "Upper left",
    LR: "Lower right",
    LL: "Lower left",
  };

  const label = `${map[position] || ""} ${number || ""}`.trim();
  return label || "Not selected";
}

function readTasks(prefix = "") {
  const tasks = {};
  TASK_IDS.forEach((taskId) => {
    const elementId = prefix
      ? `${prefix}${taskId[0].toUpperCase()}${taskId.slice(1)}`
      : taskId;
    const element = document.getElementById(elementId);
    tasks[taskId] = element ? element.checked : false;
  });
  return tasks;
}

function applyTaskSelection(prefix, tasks) {
  TASK_IDS.forEach((taskId) => {
    const elementId = prefix
      ? `${prefix}${taskId[0].toUpperCase()}${taskId.slice(1)}`
      : taskId;
    const element = document.getElementById(elementId);
    if (!element) {
      return;
    }
    element.checked = Boolean(tasks?.[taskId]);
  });
}

function hasTaskSelection(tasks) {
  return Object.values(tasks).some(Boolean);
}

function buildTaskSummary(tasks) {
  const completed = Object.keys(taskLabels).filter((key) => tasks?.[key]);
  if (!completed.length) {
    return "No tasks marked yet";
  }
  return completed.map((key) => taskLabels[key]).join(", ");
}

function updateUserBar(user) {
  const userBar = document.getElementById("userBar");
  const userName = document.getElementById("userName");
  const signOutBtn = document.getElementById("signOutBtn");

  if (!userBar || !userName || !signOutBtn) {
    return;
  }

  userBar.classList.toggle("hidden", !user);
  userName.textContent = user?.user_metadata?.display_name || user?.email || "";

  if (!signOutBtn.dataset.bound) {
    signOutBtn.addEventListener("click", () => supabaseClient.auth.signOut());
    signOutBtn.dataset.bound = "true";
  }
}

async function renderPhotoStrip(container, photos) {
  if (!container) {
    return;
  }

  container.innerHTML = "";
  const directPhotos = (photos || []).filter((photo) => photo.url);
  directPhotos.forEach((photo) => {
    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = photo.name || "Patient photo";
    img.loading = "lazy";
    container.appendChild(img);
  });

  const pathPhotos = (photos || []).filter((photo) => photo.path);
  if (!pathPhotos.length) {
    return;
  }

  const { data, error } = await supabaseClient.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(
      pathPhotos.map((photo) => photo.path),
      60 * 60,
    );

  if (error || !data) {
    return;
  }

  data.forEach((item, index) => {
    if (!item.signedUrl) {
      return;
    }

    const photo = pathPhotos[index];
    const img = document.createElement("img");
    img.src = item.signedUrl;
    img.alt = photo.name || "Patient photo";
    img.loading = "lazy";
    container.appendChild(img);
  });
}

async function uploadPhotos(userId, patientId, files) {
  const uploads = files.map(async (file) => {
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${patientId}/${Date.now()}_${cleanName}`;
    const { error } = await supabaseClient.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, { upsert: false });

    if (error) {
      throw error;
    }

    return { name: file.name, path };
  });

  return Promise.all(uploads);
}

function ensureAuth() {
  if (!currentUser) {
    window.location.href = "index.html";
    return false;
  }
  return true;
}

function setListVisibility(isAuthed) {
  const authSection = document.getElementById("authSection");
  const appSection = document.getElementById("appSection");
  const addPatientFab = document.getElementById("addPatientFab");

  if (authSection) {
    authSection.classList.toggle("hidden", isAuthed);
  }
  if (appSection) {
    appSection.classList.toggle("hidden", !isAuthed);
  }
  if (addPatientFab) {
    addPatientFab.classList.toggle("hidden", !isAuthed);
  }
}

function createPatientCard(patient) {
  const card = document.createElement("a");
  card.className = "patient-card";
  card.href = `patient.html?id=${patient.id}`;

  const header = document.createElement("div");
  header.className = "patient-card-header";

  const title = document.createElement("h3");
  title.textContent = patient.name || "Unnamed patient";

  const status = document.createElement("span");
  status.className = "status-chip";
  status.dataset.status =
    patient.status === "completed" ? "completed" : "active";
  status.textContent = patient.status === "completed" ? "Completed" : "Active";

  header.appendChild(title);
  header.appendChild(status);

  const meta = document.createElement("div");
  meta.className = "meta-row";
  meta.textContent = `Next: ${formatAppointment(patient.appointment_at)}`;

  const tooth = document.createElement("div");
  tooth.className = "meta-row";
  tooth.textContent = `Tooth: ${formatTooth(
    patient.tooth_position,
    patient.tooth_number,
  )}`;

  const tasks = document.createElement("div");
  tasks.className = "task-summary";
  tasks.textContent = `Tasks: ${buildTaskSummary(patient.tasks)}`;

  card.appendChild(header);
  card.appendChild(meta);
  card.appendChild(tooth);
  card.appendChild(tasks);

  return card;
}

function renderPatientList() {
  const list = document.getElementById("patientList");
  if (!list) {
    return;
  }

  list.innerHTML = "";
  const filtered = listPatients.filter((patient) => {
    const matchesSearch = patient.name
      ?.toLowerCase()
      .includes(listSearch.trim().toLowerCase());
    if (!matchesSearch && listSearch) {
      return false;
    }

    if (listFilter === "all") {
      return true;
    }

    return patient.status === listFilter;
  });

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "task-summary";
    empty.textContent = "No patients found. Tap + to add a new patient.";
    list.appendChild(empty);
    return;
  }

  filtered.forEach((patient) => {
    list.appendChild(createPatientCard(patient));
  });
}

async function fetchPatients() {
  if (!currentUser) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("patients")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("appointment_at", { ascending: true });

  if (error) {
    setStatusText("listStatus", `Error loading patients: ${error.message}`);
    return;
  }

  listPatients = data || [];
  renderPatientList();
}

function subscribePatients() {
  if (!currentUser) {
    return;
  }

  if (patientChannel) {
    supabaseClient.removeChannel(patientChannel);
  }

  patientChannel = supabaseClient
    .channel(`patients-${currentUser.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "patients",
        filter: `user_id=eq.${currentUser.id}`,
      },
      () => fetchPatients(),
    )
    .subscribe();
}

function initListPage() {
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const searchInput = document.getElementById("searchInput");
  const statusFilters = document.getElementById("statusFilters");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFormError("loginError", "");

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;

      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setFormError("loginError", error.message);
        return;
      }

      loginForm.reset();
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFormError("signupError", "");

      const name = document.getElementById("signupName").value.trim();
      const email = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value;

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: name,
          },
        },
      });

      if (error) {
        setFormError("signupError", error.message);
        return;
      }

      if (data?.user && !data.session) {
        setFormError(
          "signupError",
          "Check your email to confirm your account.",
        );
        return;
      }

      signupForm.reset();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      listSearch = event.target.value;
      renderPatientList();
    });
  }

  if (statusFilters) {
    statusFilters.addEventListener("click", (event) => {
      const button = event.target.closest(".seg-btn");
      if (!button) {
        return;
      }

      listFilter = button.dataset.filter || "active";
      statusFilters
        .querySelectorAll(".seg-btn")
        .forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      renderPatientList();
    });
  }
}

function initAddPage() {
  const patientForm = document.getElementById("patientForm");
  const saveBtn = document.getElementById("saveBtn");
  const visitDate = document.getElementById("visitDate");

  if (visitDate) {
    visitDate.value = toLocalDatetimeValue(new Date());
  }

  initToothPickers();

  if (!patientForm) {
    return;
  }

  patientForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!ensureAuth()) {
      return;
    }

    setStatusText("saveStatus", "Saving patient...");
    if (saveBtn) {
      saveBtn.disabled = true;
    }

    const appointmentValue = document.getElementById("appointmentDate").value;
    const appointmentDate = appointmentValue
      ? new Date(appointmentValue)
      : null;

    if (!appointmentDate || Number.isNaN(appointmentDate.getTime())) {
      setStatusText("saveStatus", "Please enter a valid appointment date.");
      if (saveBtn) {
        saveBtn.disabled = false;
      }
      return;
    }

    const tasks = readTasks();
    const lengthNotes = document.getElementById("lengthNotes").value.trim();
    const clinicalNotes = document.getElementById("clinicalNotes").value.trim();
    const visitValue = document.getElementById("visitDate").value;
    const visitDateValue = visitValue ? new Date(visitValue) : null;

    const visits = [];
    if (
      visitDateValue ||
      lengthNotes ||
      clinicalNotes ||
      hasTaskSelection(tasks)
    ) {
      visits.push({
        date: (visitDateValue || new Date()).toISOString(),
        tasks,
        length_notes: lengthNotes,
        clinical_notes: clinicalNotes,
      });
    }

    const patientData = {
      user_id: currentUser.id,
      name: document.getElementById("patientName").value.trim(),
      status: document.getElementById("status").value,
      appointment_at: appointmentDate.toISOString(),
      tooth_position: document.getElementById("toothPosition").value,
      tooth_number: document.getElementById("toothNumber").value,
      tasks,
      length_notes: lengthNotes,
      clinical_notes: clinicalNotes,
      visits,
      photos: [],
    };

    try {
      const { data, error } = await supabaseClient
        .from("patients")
        .insert([patientData])
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      const files = Array.from(
        document.getElementById("patientPhotos").files || [],
      );
      if (files.length && data?.id) {
        setStatusText("saveStatus", `Uploading ${files.length} photo(s)...`);
        const uploadedPhotos = await uploadPhotos(
          currentUser.id,
          data.id,
          files,
        );
        await supabaseClient
          .from("patients")
          .update({ photos: uploadedPhotos })
          .eq("id", data.id);
      }

      window.location.href = `patient.html?id=${data.id}`;
    } catch (error) {
      setStatusText("saveStatus", `Error: ${error.message}`);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
      }
    }
  });
}

function renderVisitList(visits) {
  const visitList = document.getElementById("visitList");
  if (!visitList) {
    return;
  }

  visitList.innerHTML = "";
  if (!visits || !visits.length) {
    const empty = document.createElement("div");
    empty.className = "task-summary";
    empty.textContent = "No visits recorded yet.";
    visitList.appendChild(empty);
    return;
  }

  visits
    .slice()
    .reverse()
    .forEach((visit) => {
      const card = document.createElement("div");
      card.className = "visit-card";

      const title = document.createElement("strong");
      title.textContent = formatAppointment(visit.date);

      const tasks = document.createElement("div");
      tasks.className = "task-summary";
      tasks.textContent = `Tasks: ${buildTaskSummary(visit.tasks)}`;

      card.appendChild(title);
      card.appendChild(tasks);

      if (visit.length_notes) {
        const lengthNotes = document.createElement("div");
        lengthNotes.textContent = `Length notes: ${visit.length_notes}`;
        card.appendChild(lengthNotes);
      }

      if (visit.clinical_notes) {
        const clinicalNotes = document.createElement("div");
        clinicalNotes.textContent = `Clinical notes: ${visit.clinical_notes}`;
        card.appendChild(clinicalNotes);
      }

      visitList.appendChild(card);
    });
}

function populateEditForm(patient) {
  const editPatientName = document.getElementById("editPatientName");
  const editStatus = document.getElementById("editStatus");
  const editAppointmentDate = document.getElementById("editAppointmentDate");
  const editToothPosition = document.getElementById("editToothPosition");
  const editToothNumber = document.getElementById("editToothNumber");

  if (editPatientName) {
    editPatientName.value = patient.name || "";
  }
  if (editStatus) {
    editStatus.value = patient.status || "active";
  }
  if (editAppointmentDate && patient.appointment_at) {
    editAppointmentDate.value = toLocalDatetimeValue(
      new Date(patient.appointment_at),
    );
  }
  if (editToothPosition) {
    editToothPosition.value = patient.tooth_position || "";
  }
  if (editToothNumber) {
    editToothNumber.value = patient.tooth_number || "";
  }

  syncToothPicker("editToothPosition", "editToothNumber");
}

function renderPatientDetail(patient) {
  const patientTitle = document.getElementById("patientTitle");
  const patientSubtitle = document.getElementById("patientSubtitle");
  const patientStatus = document.getElementById("patientStatus");
  const patientAppointment = document.getElementById("patientAppointment");
  const patientTooth = document.getElementById("patientTooth");
  const photoStrip = document.getElementById("photoStrip");

  if (patientTitle) {
    patientTitle.textContent = patient.name || "Patient";
  }
  if (patientSubtitle) {
    patientSubtitle.textContent = `Next: ${formatAppointment(
      patient.appointment_at,
    )}`;
  }
  if (patientStatus) {
    patientStatus.textContent =
      patient.status === "completed" ? "Completed" : "Active";
  }
  if (patientAppointment) {
    patientAppointment.textContent = formatAppointment(patient.appointment_at);
  }
  if (patientTooth) {
    patientTooth.textContent = formatTooth(
      patient.tooth_position,
      patient.tooth_number,
    );
  }

  renderPhotoStrip(photoStrip, patient.photos || []);
  populateEditForm(patient);
  applyTaskSelection("visit", patient.tasks || {});
  renderVisitList(patient.visits || []);
}

async function loadPatient(patientId) {
  const { data, error } = await supabaseClient
    .from("patients")
    .select("*")
    .eq("id", patientId)
    .single();

  if (error) {
    setStatusText("editStatusMessage", `Error: ${error.message}`);
    return;
  }

  currentPatient = data;
  renderPatientDetail(data);
}

function initDetailPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = urlParams.get("id");
  if (!patientId) {
    window.location.href = "index.html";
    return;
  }

  const toggleEditBtn = document.getElementById("toggleEditBtn");
  const editSection = document.getElementById("editSection");
  const editForm = document.getElementById("editForm");
  const visitForm = document.getElementById("visitForm");
  const visitDate = document.getElementById("visitDate");
  const deleteBtn = document.getElementById("deletePatientBtn");

  if (visitDate) {
    visitDate.value = toLocalDatetimeValue(new Date());
  }

  initToothPickers();

  if (toggleEditBtn && editSection) {
    toggleEditBtn.addEventListener("click", () => {
      editSection.classList.toggle("hidden");
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!ensureAuth()) {
        return;
      }

      const confirmed = window.confirm(
        "Delete this patient? This cannot be undone.",
      );
      if (!confirmed) {
        return;
      }

      setStatusText("deleteStatus", "Deleting...");
      const { error } = await supabaseClient
        .from("patients")
        .delete()
        .eq("id", patientId);

      if (error) {
        setStatusText("deleteStatus", `Error: ${error.message}`);
        return;
      }

      window.location.href = "index.html";
    });
  }

  if (editForm) {
    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ensureAuth()) {
        return;
      }

      setStatusText("editStatusMessage", "Saving changes...");
      const appointmentValue = document.getElementById(
        "editAppointmentDate",
      ).value;
      const appointmentDate = appointmentValue
        ? new Date(appointmentValue)
        : null;

      if (!appointmentDate || Number.isNaN(appointmentDate.getTime())) {
        setStatusText("editStatusMessage", "Please enter a valid date.");
        return;
      }

      const updates = {
        name: document.getElementById("editPatientName").value.trim(),
        status: document.getElementById("editStatus").value,
        appointment_at: appointmentDate.toISOString(),
        tooth_position: document.getElementById("editToothPosition").value,
        tooth_number: document.getElementById("editToothNumber").value,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabaseClient
        .from("patients")
        .update(updates)
        .eq("id", patientId);

      if (error) {
        setStatusText("editStatusMessage", `Error: ${error.message}`);
        return;
      }

      setStatusText("editStatusMessage", "Saved.");
      loadPatient(patientId);
    });
  }

  if (visitForm) {
    visitForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ensureAuth()) {
        return;
      }

      setStatusText("visitStatus", "Saving visit...");
      const visitValue = document.getElementById("visitDate").value;
      const visitDateValue = visitValue ? new Date(visitValue) : null;

      if (!visitDateValue || Number.isNaN(visitDateValue.getTime())) {
        setStatusText("visitStatus", "Please enter a valid visit date.");
        return;
      }

      const tasks = readTasks("visit");
      const lengthNotes = document
        .getElementById("visitLengthNotes")
        .value.trim();
      const clinicalNotes = document
        .getElementById("visitClinicalNotes")
        .value.trim();

      const newVisit = {
        date: visitDateValue.toISOString(),
        tasks,
        length_notes: lengthNotes,
        clinical_notes: clinicalNotes,
      };

      const visits = [...(currentPatient?.visits || []), newVisit];
      const updates = {
        visits,
        tasks,
        length_notes: lengthNotes,
        clinical_notes: clinicalNotes,
        updated_at: new Date().toISOString(),
      };

      const files = Array.from(
        document.getElementById("visitPhotos").files || [],
      );

      try {
        if (files.length) {
          const uploadedPhotos = await uploadPhotos(
            currentUser.id,
            patientId,
            files,
          );
          updates.photos = [
            ...(currentPatient?.photos || []),
            ...uploadedPhotos,
          ];
        }

        const { error } = await supabaseClient
          .from("patients")
          .update(updates)
          .eq("id", patientId);

        if (error) {
          throw error;
        }

        visitForm.reset();
        document.getElementById("visitDate").value = toLocalDatetimeValue(
          new Date(),
        );
        setStatusText("visitStatus", "Visit saved.");
        loadPatient(patientId);
      } catch (error) {
        setStatusText("visitStatus", `Error: ${error.message}`);
      }
    });
  }

  loadPatient(patientId);
}

async function handleSession(session) {
  currentUser = session?.user || null;
  updateUserBar(currentUser);

  if (page === "list") {
    setListVisibility(!!currentUser);
    if (currentUser) {
      fetchPatients();
      subscribePatients();
    } else if (patientChannel) {
      supabaseClient.removeChannel(patientChannel);
      patientChannel = null;
    }
  }

  if (page === "add" || page === "detail") {
    if (!currentUser) {
      ensureAuth();
    }
  }
}

async function initAuth() {
  const { data } = await supabaseClient.auth.getSession();
  handleSession(data.session);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    handleSession(session);
  });
}

if (page === "list") {
  initListPage();
}

if (page === "add") {
  initAddPage();
}

if (page === "detail") {
  initDetailPage();
}

initAuth();
