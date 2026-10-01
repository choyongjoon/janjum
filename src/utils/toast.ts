export function showToast(
  message: string,
  type: "success" | "error" = "success"
) {
  // Create toast element using DaisyUI toast component
  const toast = document.createElement("div");
  toast.className = "toast toast-top toast-end z-50";

  // Set content with DaisyUI alert. textContent, not innerHTML, so a message
  // is never interpreted as markup.
  const alert = document.createElement("div");
  alert.className = `alert alert-${type}`;
  const text = document.createElement("span");
  text.textContent = message;
  alert.appendChild(text);
  toast.appendChild(alert);

  // Add to body
  document.body.appendChild(toast);

  // Auto remove after 3 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 3000);
}
