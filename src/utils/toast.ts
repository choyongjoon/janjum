export function showToast(
  message: string,
  type: 'success' | 'error' = 'success'
) {
  // Create toast element using DaisyUI toast component
  const toast = document.createElement('div');
  toast.className = 'toast toast-top toast-end z-50';

  // Set content with DaisyUI alert
  toast.innerHTML = `
    <div class="alert alert-${type}">
      <span>${message}</span>
    </div>
  `;

  // Add to body
  document.body.appendChild(toast);

  // Auto remove after 3 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 3000);
}
