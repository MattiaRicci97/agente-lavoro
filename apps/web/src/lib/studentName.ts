const STORAGE_KEY = "sillabo_student_name";

export function getSavedStudentName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) || "";
}

export function saveStudentName(name: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, name);
}
