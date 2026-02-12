document.addEventListener("DOMContentLoaded", function() {
  var modeSwitchButton = document.getElementById("mode-switch");
  if (!modeSwitchButton) return;
  var bodyElement = document.body;
  var sunIcon = modeSwitchButton.querySelector('.is-sun');
  var moonIcon = modeSwitchButton.querySelector('.is-moon');

  if (localStorage.getItem("lightMode") === "enabled") {
    bodyElement.classList.add("light-mode");
    if (moonIcon) moonIcon.style.display = 'none';
    if (sunIcon) sunIcon.style.display = 'block';
  } else {
    bodyElement.classList.remove("light-mode");
    if (moonIcon) moonIcon.style.display = 'block';
    if (sunIcon) sunIcon.style.display = 'none';
  }

  function replaceTextClass(isLightMode) {
    document.querySelectorAll(isLightMode ? ".text-amarillo" : ".text-verde").forEach(function(el) {
      el.classList.toggle("text-amarillo", !isLightMode);
      el.classList.toggle("text-verde", isLightMode);
    });
  }

  replaceTextClass(bodyElement.classList.contains("light-mode"));

  modeSwitchButton.addEventListener("click", function(e) {
    e.preventDefault();
    bodyElement.classList.toggle("light-mode");
    var isLight = bodyElement.classList.contains("light-mode");
    if (sunIcon) sunIcon.style.display = isLight ? 'block' : 'none';
    if (moonIcon) moonIcon.style.display = isLight ? 'none' : 'block';
    localStorage.setItem("lightMode", isLight ? "enabled" : "disabled");
    replaceTextClass(isLight);
  });
});
