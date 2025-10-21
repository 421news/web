document.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault(); // prevent default anchor behavior
      var goTo = this.getAttribute("href"); // store anchor href

      setTimeout(function(){
        window.location = goTo;
      }, 1000); // the duration of the "load out" animation in milliseconds
    });
  });
