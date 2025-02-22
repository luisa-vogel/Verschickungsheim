/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', toggleSceneList);

  // Start with the scene list open on desktop.
  //if (!document.body.classList.contains('mobile')) {

  //}else{
    //showSceneList();
  //}

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {

        if( scene.data.id === "0-eingang" || scene.data.id === "5-essen---eingang" || scene.data.id === "9-schlafsaal-eingang"){
          sceneElements[1].classList.add('current');
          sceneElements[3].classList.remove('current');
          sceneElements[11].classList.remove('current');
          sceneElements[10].classList.remove('current');}
          else if(scene.data.id === "3-schlafsaal-hinten" || scene.data.id === "4-speisesaal---schlafzimmer" || scene.data.id === "8-schlafzimmer-schlafzimmer" || scene.data.id === "10-eingang-schlafsaal"){
          sceneElements[11].classList.add('current');
          sceneElements[10].classList.add('current');
          sceneElements[1].classList.remove('current');
          sceneElements[3].classList.remove('current');
        }
            else if(scene.data.id === "1-speisesall-speisesaal-hinten" || scene.data.id==="6-speisesaal-speisesaal-vorne"||"7-schlafzimmer-spseisesaal" || scene.data.id === "2-eingang-essen"){
            sceneElements[1].classList.remove('current');
            sceneElements[11].classList.remove('current');
            sceneElements[10].classList.remove('current');
            sceneElements[3].classList.add('current');}
          else {
        el.classList.remove('current');
      }
    }
  }
}
  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create image element.
    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    //var tooltip = document.createElement('div');
    //tooltip.classList.add('hotspot-tooltip');
    //tooltip.classList.add('link-hotspot-tooltip');
    //tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    //wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {

  //Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    // Create image element.
    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Construct header element.
    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);

    // Place header and text into wrapper element.
    wrapper.appendChild(header);

    if(hotspot.title === 'Postkarten & Pakete' || hotspot.title === 'Fieberthermometer' || hotspot.title ==='Medikamente'){
      titleWrapper.classList.add('info-hotspot-title-long');
      header.classList.add('info-hotspot-header-long');
    }

    //Content Hotspot
    var content = document.createElement('div');
    content.classList.add('hotspot-content');

    var overlayTitle = document.createElement('div');
    var overlayHeadline = document.createElement('h2');
    overlayHeadline.innerHTML = hotspot.title;
    overlayTitle.classList.add('overlay-title');
    overlayTitle.appendChild(overlayHeadline);
    content.appendChild(overlayTitle);

    // Create Quote element
    var quote = document.createElement('div');
    quote.classList.add('info-hotspot-quote');
    quote.classList.add('info-hotspot-text');
    var quoteinhalt = document.createElement('p');
    quoteinhalt.innerHTML = hotspot.quote;
    var linie = document.createElement('hr');
    linie.classList.add('trennlinie');
    quote.appendChild(quoteinhalt);
    quote.appendChild(linie);

    if(hotspot.quote ===''){ // wenn kein Bild eingefügt werden soll, x bei img einsetzen

    }else {
      content.appendChild(quote);
    };


    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    var textelement = document.createElement('p');
    textelement.classList.add('info-hotspot-text-normal');
    textelement.innerHTML = hotspot.text;

    // create img img_gegenstand
    var imgGegenstand = document.createElement('img');
    imgGegenstand.src = hotspot.img_gegenstand;
    imgGegenstand.classList.add('info-hotspot-image-gegenstand');

        //Bild einsetzen
        if(hotspot.img_gegenstand ==='x'){ // wenn kein Bild eingefügt werden soll, x bei img einsetzen
        }else {
          text.appendChild(imgGegenstand);
        };

    text.appendChild(textelement);
    content.appendChild(text);


    // Create img element. Luisa
    var imgWrapper = document.createElement('div');
    imgWrapper.classList.add('info-hotspot-img-wrapper'); //--> css
    var hotspotImage = document.createElement('img');
    hotspotImage.src = hotspot.img;
    hotspotImage.classList.add('info-hotspot-image')
    imgWrapper.appendChild(hotspotImage);

    // Bildunterschrift
    var bildunterschrifttext = document.createElement('p');
    bildunterschrifttext.classList.add('info-hotspot-bildunterschrift');
    bildunterschrifttext.innerHTML = hotspot.bildunterschrift;

        //Bild einsetzen
        if(hotspot.img ==='x'){ // wenn kein Bild eingefügt werden soll, x bei img einsetzen
        }else {
          content.appendChild(imgWrapper);
          if(hotspot.bildunterschrift === 'x'){
          } else{
            imgWrapper.appendChild(bildunterschrifttext);
          }
        };




    // Text in Overlay anzeigen
    var element = document.getElementById("overlaytext");
    element.appendChild(content);

    //Öffnen und schließen des Overlays
    var geschlossen = new Boolean("false"); // Kontrollvariable zum schließen
    geschlossen = false;

    //anzeigen des Overlays
    var overlayanzeigen = function() {

      content.classList.toggle('visible');
      overlayschliessen();
    };


    var anzeigen = document.getElementsByClassName('info-hotspot-header');
    function on() {
      document.getElementById("black").style.display = "block";
      document.getElementById("overlay").style.display = "block";
      for (var i = 0; i < anzeigen.length; i ++) {
        anzeigen[i].style.display = 'none';
      }
      var g = document.getElementById("audiodatei");
      g.setAttribute("controls", "controls");
      }

      // Show content when hotspot is clicked.
      wrapper.querySelector('.info-hotspot-header').addEventListener('click', on);

      //wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);
      wrapper.querySelector('.info-hotspot-header').addEventListener('click', overlayanzeigen);


      //schließen des Overlays
      function overlayschliessen(e) {
        var schliessen = document.querySelectorAll('#overlay > div.info-hotspot-close-wrapper');
        var inputs = document.querySelectorAll("input[type=text]");

        for (var i = 0; i < schliessen.length; i++) {
          schliessen[i].addEventListener('click', function() {
            document.getElementById("black").style.display = "none";
            document.getElementById("overlay").style.display = "none";
            for (var i = 0; i < anzeigen.length; i ++) {
              anzeigen[i].style.display = 'block';
            }

            geschlossen = true;
            if (geschlossen){
              content.classList.remove('visible');
            }
        });
        }
      };


    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // Display the initial scene.
  switchScene(scenes[0]);

})();

//Schließen der Bedienungsanleitung
function off() {
  document.getElementById("schwarz").style.display = "none";
}
