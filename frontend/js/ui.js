const closeWindow = document.getElementById("closeModal");
const welcomeModal = document.querySelector(".welcome-window");

if (sessionStorage.getItem("modalState") === "closed" && welcomeModal) {
    welcomeModal.style.display = "none";
}

if (closeWindow && welcomeModal) {
    closeWindow.addEventListener("click", () => {
        welcomeModal.classList.add("hidden");
        sessionStorage.setItem("modalState", "closed");
        setTimeout(() => {
            welcomeModal.style.display = "none";
        }, 300);
    });
}