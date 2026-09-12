window.$ = window.jQuery = require("jquery");

let bootstrap = require("bootstrap");

let Dictionary = require("./dictionary");
let DictLevel = require("./databaseLevel");
let converter = require('pinyin-tone-converter');

//load the actual database
var database = new Dictionary();

//a global variable indicating whether or not any popover anywhere in the document is in edit mode
var anyEditMode = false;

//the SpanMachine (if any) that currently owns the one popover allowed to be
//open at a time (hover popup or edit popover). Moving the mouse over a word
//while another word's popover is open (most commonly while that popover is
//in edit mode, since edit popovers don't close on mouseleave) must not open
//a second popover - there's only one mouse, so only one popover should ever
//be open.
var activePopoverSpan = null;

//allow button elements for the sanitizer (it's a Bootstrap thing)
let nAllowList = bootstrap.Tooltip.Default.allowList;
nAllowList.button = ["type"];
nAllowList.input = ["value", "type"];

module.exports = class SpanMachine {

  constructor(element) {
    this.element = element;

    this.element.spanComputer = this;
    this.element.addEventListener('mouseenter', function(event) {
      event.target.spanComputer.hovering = true;
      event.target.spanComputer.popup();
    });
    this.element.addEventListener('mouseleave', function(event) {
      event.target.spanComputer.hovering = false;
      event.target.spanComputer.popdown();
    });
    this.element.addEventListener('click', function(event) {
      event.target.spanComputer.toggleEditMode();
    });

    this.editMode = false;
    this.hovering = false;
  }

  _createEditPopover() {
    bootstrap.Popover.getInstance(this.element)?.dispose();

    let popContent = "";
    let words = database.getDefinitions(this.element.textContent, true);
    if (words.length > 0) {
      for (const word of words) {
        popContent += '<div class="entry" tradChars="' + word.tradChars + '" simpChars="' + word.simpChars + '">';
        popContent += '<h5><span class="tradChars">' + word.tradChars + '</span>|<span class="simpChars">' + word.simpChars + "</span></h5>";
        popContent += '<input class="pinyin" type="text" value="' + word.pinyin + '"/>';
        popContent += "<ul>";
        for (let def of word.definitions) {
          popContent += '<li><input class="defInput" type="text" value="' + def + '"/>';
          popContent += '<button type="button" class="btn removeDef">-</button></li>';
        }
        popContent += '<li><button type="button" class="btn addDef">Add Definition</button></li>'
        popContent += "</ul>";
        popContent += '</div>';
      }
      popContent += '<div><button type="button" id="cancel" class="btn">Cancel</button>';
      popContent += '<button type="button" id="save" class="btn">Save</button></div>';
      popContent += '<div><button type="button" id="breakLeft" class="btn">o</button>';
      popContent += '<button type="button" id="expandLeft" class="btn">&lt;</button>';
      popContent += '<button id="expandRight" type="button" class="btn">&gt;</button>';
      popContent += '<button type="button" id="breakRight" class="btn">o</button></div>';
    } else {
      //TODO: create edit mode of this popover
      popContent += "<h5>" + this.element.innerHTML + "</h5>";

      popContent += '<input class="pinyin" type="text" value=""/>';

      popContent += "<ul>";
      popContent += '<li><button type="button" class="btn addDef">Add Definition</button></li>'
      popContent += "</ul>";
      popContent += '</div>';

      popContent += '<div><button type="button" id="cancel" class="btn">Cancel</button>';
      popContent += '<button type="button" id="save" class="btn">Save</button></div>';
      popContent += '<div><button type="button" id="breakLeft" class="btn">o</button>';
      popContent += '<button type="button" id="expandLeft" class="btn">&lt;</button>';
      popContent += '<button id="expandRight" type="button" class="btn">&gt;</button>';
      popContent += '<button type="button" id="breakRight" class="btn">o</button></div>';
    }

    new bootstrap.Popover(this.element, {
      content: popContent,
      delay: 0,
      html: true,
      placement: "bottom",
      trigger: "manual",
      allowList: nAllowList
    }).show();

    //add the appropriate listeners to the buttons

    $(".removeDef").click(function(event) {
      $(event.target.parentNode).remove();
    });

    $(".addDef").prop("parentSpan", this.element); //addDef needs access to the parent span
    $(".addDef").click(function(event) {
      //      button                                               button     li         li
      $(event.target).prop("parentSpan").spanComputer.addDef(event.target.parentNode.parentNode);
    });

    $("#cancel").prop('parentSpan', this.element);
    $("#cancel").click(function(event) {
      $(event.target).prop('parentSpan').spanComputer.cancel();
    });

    $("#save").prop('parentSpan', this.element);
    $("#save").click(function(event) {
      $(event.target).prop('parentSpan').spanComputer.save();
    });

    $("#breakLeft").prop('parentSpan', this.element); //add needed reference to the span this button controls
    $("#breakLeft").click(function(event) {
      $(event.target).prop('parentSpan').spanComputer.breakLeft();
    });
    $("#expandLeft").prop('parentSpan', this.element); //add needed reference to the span this button controls
    $("#expandLeft").click(function(event) {
      $(event.target).prop('parentSpan').spanComputer.expandLeft();
    });
    $("#expandRight").prop('parentSpan', this.element);
    $("#expandRight").click(function(event) {
      $(event.target).prop('parentSpan').spanComputer.expandRight();
    });
    $("#breakRight").prop('parentSpan', this.element);
    $("#breakRight").click(function(event) {
      $(event.target).prop('parentSpan').spanComputer.breakRight();
    });
  }

  addDef(ul) {
    //create dom elements, configure them, and add to the dom

    let newLI = document.createElement("li");

    let newInput = document.createElement("input");
    $(newInput).addClass("defInput")
    newInput.type = "text";

    let newButton = document.createElement('button');
    newButton.type = "button";
    $(newButton).addClass("btn removeDef");
    newButton.innerHTML = "-";
    $(newButton).prop("parentSpan", this.element);
    $(newButton).click(function(event) {
      $(event.target.parentNode).remove();
    });

    newLI.appendChild(newInput);
    newLI.appendChild(newButton);

    $(ul).find('.addDef').before(newLI);
  }

  cancel() {
    //exit edit mode without saving; toggleEditMode() reverts to the regular popup
    //since it will re-read from the database rather than whatever was typed
    this.toggleEditMode();
  }

  save() {
    let self = this;
    $('.entry').each(function(index, element) {
      let defs = [];
      $(element).find('.defInput').each( (index, def) => {
        defs.push(def.value);
      })

      database.save(
        $(element).find('.tradChars').prop('innerHTML'), //traditional characters
        $(element).find('.tradChars').prop('innerHTML'), //simplified characters
        $(element).find('.pinyin').prop('value'),        //pinyin
        defs,
        DictLevel.TEXT
      );
    });

    this._createEditPopover();
  }

  breakLeft() {
    if (this.element.innerHTML.length > 1) {
      $(this.element).before('<span class="simplified" data-toggle="popover">' + this.element.innerHTML.charAt(0) + '</span>');
      $(this.element).prev().each( function(index, element) {
        element.spanComputer = new SpanMachine(element);
      });

      this.element.innerHTML = this.element.innerHTML.substr(1);
      this._createEditPopover();
    }
  }

  breakRight() {
    if (this.element.innerHTML.length > 1) {
      let len = this.element.innerHTML.length;

      $(this.element).after('<span class="simplified" data-toggle="popover">' + this.element.innerHTML.charAt(len-1) + '</span>');
      $(this.element).next().each( function(index, element) {
        element.spanComputer = new SpanMachine(element);
      });

      this.element.innerHTML = this.element.innerHTML.substr(0,len-1);
      this._createEditPopover();
    }
  }

  expandLeft()  {
    let expandTo = $(this.element).prev()[0]; //TODO: handle case of no earlier element
    let expansionChars = expandTo.innerHTML;
    if (expansionChars.length <= 1) {
      //if there was only one character, remove the empty element
      this.element.parentNode.removeChild(expandTo);
    } else {
      //strip the last character out of previous node
      expandTo.innerHTML = expansionChars.substr(0,expansionChars.length-1);
    }
    
    //add to beginning of this span
    this.element.innerHTML = expansionChars.charAt(expansionChars.length-1) + this.element.innerHTML;
    this._createEditPopover();
  }

  expandRight() {
    let expandTo = $(this.element).next()[0]; //TODO: handle case of no later element
    let expansionChars = expandTo.innerHTML;
    if (expansionChars.length <= 1) {
      //if there was only one character, remove the empty element
      this.element.parentNode.removeChild(expandTo);
    } else {
      //strip the first character out of next node
      expandTo.innerHTML = expansionChars.substr(1);
    }
    
    //add to beginning of this span
    this.element.innerHTML = this.element.innerHTML + expansionChars.charAt(0);
    this._createEditPopover();
  }

  toggleEditMode() {
    //if not in edit mode, no one else in edit mode, and no other span's
    //popover is currently occupying the one-popover-at-a-time slot
    if (!this.editMode && !anyEditMode && (activePopoverSpan === null || activePopoverSpan === this)) {
      this._createEditPopover();

      activePopoverSpan = this;
      anyEditMode = true;
      this.editMode = true;
    } else if (this.editMode) { //else in edit mode
      bootstrap.Popover.getInstance(this.element)?.dispose();
      this.editMode = false;
      anyEditMode = false;
      if (activePopoverSpan === this) {
        activePopoverSpan = null;
      }
      //only reopen the regular word popup if the mouse is actually still over
      //this span - exiting via a button click (e.g. Cancel) moves the mouse
      //off the span, and it won't fire mouseleave again to close a popup
      //opened here unconditionally
      if (this.hovering) {
        this.popup();
      } else {
        $(this.element).css("background-color", "");
      }
    }
  }

  popup() {
    //there's only one mouse - don't open a second popover while a popover
    //(this span's own edit popover included) is already open. Editing a word
    //can change its on-screen size (e.g. expandRight growing it to cover
    //where the mouse already sits), which fires a fresh mouseenter on the
    //very span that's already showing its edit popover; letting popup() run
    //there would stack a second bootstrap.Popover instance on the same
    //element, and since Bootstrap's instance registry only remembers the
    //newest one, the edit popover's Cancel/Save button would go on
    //disposing the wrong instance and never close.
    if (activePopoverSpan !== null || this.editMode) {
      return;
    }

    let popContent = "";
    let words = database.getDefinitions(this.element.textContent, true);
    if (words.length > 0) {
      for (const word of words) {
        popContent += "<h5>" + word.tradChars + '|' + word.simpChars + "</h5>";
        popContent += "<h6>" + converter.convertPinyinTones(word.pinyin) + "</h6>";
        popContent += "<ul>";
        for (let def of word.definitions) {
          popContent += "<li>" + def + "</li>";
        }
        popContent += "</ul>";
      }
    } else {
      popContent += "<h5>" + this.element.innerHTML + "</h5>";
      popContent += "<h6>There is no entry in the<br/>dictionary for this string</h6>";
    }

    bootstrap.Popover.getInstance(this.element)?.dispose();

    activePopoverSpan = this;
    $(this.element).css("background-color", "lightgray");
    new bootstrap.Popover(this.element, {
      content: popContent,
      delay: 300,
      html: true,
      placement: "bottom",
      trigger: "manual",
      allowList: nAllowList
    }).show();
  }

  popdown() {
    if (!this.editMode) {
      bootstrap.Popover.getInstance(this.element)?.dispose();
      $(this.element).css("background-color", "");
      if (activePopoverSpan === this) {
        activePopoverSpan = null;
      }
    }
  }
}