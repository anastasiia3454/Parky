// Willkommensfenster und Nutzungsbedingungen
export function initModal() {
    const closeBtn = document.getElementById('closeModal');
    const modal = document.querySelector('.welcome-window');
    const acceptCheckbox = document.getElementById('acceptTerms');
    const toggleTermsBtn = document.getElementById('toggleTermsBtn');
    const termsInfoBox = document.getElementById('termsInfoBox');

    if (sessionStorage.getItem('modalState') === 'closed' && modal) {
        modal.style.display = 'none';
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            sessionStorage.setItem('modalState', 'closed');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        });
    }

    if (acceptCheckbox && closeBtn) {
        acceptCheckbox.addEventListener('change', () => {
            closeBtn.disabled = !acceptCheckbox.checked;
        });
    }

    if (toggleTermsBtn && termsInfoBox) {
        toggleTermsBtn.addEventListener('click', () => {
            const isHidden = termsInfoBox.hasAttribute('hidden');
            if (isHidden) {
                termsInfoBox.removeAttribute('hidden');
                toggleTermsBtn.textContent = 'Nutzungsbedingungen ausblenden';
            } else {
                termsInfoBox.setAttribute('hidden', '');
                toggleTermsBtn.textContent = 'Nutzungsbedingungen';
            }
        });
    }
}