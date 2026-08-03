document.addEventListener('DOMContentLoaded', () => {
  const fabButton = document.getElementById('fab-menu-button');
  const fabMenuItemsContainer = document.getElementById('fab-menu-items');

  if (!fabButton || !fabMenuItemsContainer) return;

  fabButton.addEventListener('click', () => {
    const isActive = fabButton.classList.toggle('active');
    if (isActive) {
      fabMenuItemsContainer.classList.remove('opacity-0', 'scale-90', 'pointer-events-none');
    } else {
      fabMenuItemsContainer.classList.add('opacity-0', 'scale-90');
      setTimeout(() => fabMenuItemsContainer.classList.add('pointer-events-none'), 300);
    }
  });
});
