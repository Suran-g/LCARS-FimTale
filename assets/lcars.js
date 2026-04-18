document.addEventListener("touchstart", function() {},false);

let mybutton = document.getElementById("topBtn");

window.onscroll = function() {scrollFunction()};

function scrollFunction() {
  if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
    if (mybutton) {
      mybutton.style.display = "block";
    }
  } else {
    if (mybutton) {
      mybutton.style.display = "none";
    }
  }
}

function topFunction() {
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
}

function playSoundAndRedirect(audioId, url) {
    try {
        var audio = document.getElementById(audioId);
        if (audio) {
            audio.play().catch(function() {});
            audio.onended = function() {
                window.location.href = url;
            };
        } else {
            window.location.href = url;
        }
    } catch(e) {
        window.location.href = url;
    }
}

function goToAnchor(anchorId) {
  window.location.hash = anchorId;
}

var acc = document.getElementsByClassName("accordion");
var i;

for (i = 0; i < acc.length; i++) {
  acc[i].addEventListener("click", function() {
    this.classList.toggle("active");
    var accordionContent = this.nextElementSibling;
    if (accordionContent.style.maxHeight){
      accordionContent.style.maxHeight = null;
    } else {
      accordionContent.style.maxHeight = accordionContent.scrollHeight + "px";
    } 
  });
}

function initLCARSKeystroke() {
  try {
    const LCARSkeystroke = document.getElementById('LCARSkeystroke');
    if (LCARSkeystroke) {
      const allPlaySoundButtons = document.querySelectorAll('.playSoundButton');
      allPlaySoundButtons.forEach(button => {
        button.addEventListener('click', function() {
          LCARSkeystroke.pause();
          LCARSkeystroke.currentTime = 0;
          LCARSkeystroke.play().catch(function() {});
        });
      });
    }
  } catch(e) {
    console.log('LCARS keystroke initialization skipped');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  initLCARSKeystroke();
});