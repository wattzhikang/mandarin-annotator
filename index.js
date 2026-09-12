'use strict';

let $ = require("jquery");
let fs = require('fs');
let { webUtils } = require('electron');
let SpanMachine = require('./SpanMachine');
let Dictionary = require('./dictionary');

var database = new Dictionary();

//load words that exist only in the text
function loadWords(words) {
    for (let word of words) {
        database.save(
            word.tradChars,
            word.simpChars,
            word.pinyin,
            word.defs,
            2
        );
    }
}

function loadFile(err, data) {
    //first read custom definitions

    //if the first non-whitespace character is a '[', then it's a json list
    if (/^\s*\{/.test(data)) {
        //apologies for the C-style string parsing
        let jsonStart = 0;
        //find the beginning of the text data
        for (jsonStart = 0; jsonStart < data.length; jsonStart++) {
            if (data[jsonStart] === '{') {
                break;
            }
        }
        if (jsonStart == data.length) {
            console.error('the json string is not valid');
        }

        let jsonEnd;
        //find the end of the text data using a stack to match brackets
        let bracketStack = ['{'];
        for (jsonEnd = jsonStart + 1; jsonEnd < data.length; jsonEnd++) {
            if (bracketStack.length === 0) {
                break;
            }

            if (data[jsonEnd] === '{') {
                bracketStack.push(data[jsonEnd]);
            } else if (data[jsonEnd] === '}') {
                bracketStack.pop();
            }
        }
        if (jsonEnd == data.length) {
            console.error('the json string is not valid');
        }

        let textData = JSON.parse(data.substring(jsonStart, jsonEnd));
        loadWords(textData.words);

        data = data.substring(jsonEnd, data.length);
    } else {
        console.log('json not detected');
    }
    
    //create div for whole text
    let docDiv = document.createElement('div');
    docDiv.id = 'chineseText';

    //add one line at a time
    //be sure to add the spanMachine to each word span
    let lines = data.split('\n');
    for (let line of lines) {
        line = line.trim().split(' ');
        if (line.length < 1) {
            continue;
        }

        let paragraph = document.createElement('p');
        if (line[0] === "#") {
            //make it a heading
            paragraph.classList.add('a');
            line.shift();
        } else if (line[0] === '##') {
            //smaller heading
            paragraph.classList.add('b');
            line.shift();
        }

        for (let word of line) {
            let element = document.createElement('span');

            //if it is a chinese character, it should be defined
            if (/\p{Script=Han}/u.test(word)) {
                element.classList.add('simplified');
                new SpanMachine(element);
            }
            element.innerHTML = word;

            paragraph.appendChild(element);
        }

        docDiv.appendChild(paragraph);
    }

    document.body.appendChild(docDiv);
}

/*
This function will create a list element that allows the user to
edit a vocabulary item. 'entry' should be an element of an array
returned by getCustomDefs() if the list element is supposed to
represent an existing entry in the database. If 'entry' is
undefined, then the list element will be blank, and the save button
will create an entry in the database.
*/
function prepareEntry(entry) {
    // this function wiill enable the save button. It is meant
    // to be enabled when the user actually edits the entry
    function toggleSave(event) {saveButton.disabled = false;}

    let li = document.createElement('li');

    let tradBox = document.createElement('input');
    tradBox.type = 'text';
    tradBox.addEventListener('input', toggleSave);
    li.appendChild(tradBox);

    let simpBox = document.createElement('input');
    simpBox.type = 'text';
    simpBox.addEventListener('input', toggleSave);
    li.appendChild(simpBox);

    let pinyinBox = document.createElement('input');
    pinyinBox.classList.add('pinyinEditor');
    pinyinBox.type = 'text';
    pinyinBox.addEventListener('input', toggleSave);
    li.appendChild(pinyinBox);

    //create the list of definitions
    let defList = document.createElement('ul');
    defList.classList.add('defList');

    //add the "Add Definition" button
    let addDefLi = document.createElement('li');
    let addDefButton = document.createElement('button');
    addDefButton.classList.add('btn');
    addDefButton.innerHTML = 'Add Definition';
    addDefButton.addEventListener('click', function(event) {
        //add a blank definition
        let newLi = document.createElement('li');

        let newInput = document.createElement('input');
        //if the box is modified, the save button should be enabled
        newInput.addEventListener('input', toggleSave);
        newLi.appendChild(newInput);

        //a button to remove this definition
        let defRemove = document.createElement('button');
        defRemove.classList.add('btn');
        defRemove.innerHTML = '-';
        defRemove.addEventListener('click', function(event) {
            newLi.remove();
            toggleSave(event);
        });
        newLi.appendChild(defRemove);

        $(addDefLi).before(newLi); //insert it before the add definition button
    });
    addDefLi.appendChild(addDefButton);
    defList.appendChild(addDefLi);
    li.appendChild(defList);

    //a button to expand and hide the definition list
    $(defList).css('display', 'none');
    let defToggle = document.createElement('button');
    defToggle.innerHTML = '+';
    defToggle.addEventListener('click', function(event) {
        if ($(defList).css('display') === 'none') {
            $(defList).css('display', '');
            defToggle.innerHTML = '-';
        } else {
            $(defList).css('display', 'none');
            defToggle.innerHTML = '+';
        }
    });
    li.appendChild(defToggle);

    let saveButton = document.createElement('button');
    saveButton.classList.add('btn');
    saveButton.innerHTML = 'Save';
    saveButton.disabled = true;
    li.appendChild(saveButton);


    //this function will return a function that will update a specific entry
    //in the database based on information in this list element. You can use
    //this function to bind the save button to a specific entry in the database
    let update = function(id) {
        return function(event) {
            let defs = [];
            $(defList).find('input').each((index, def) => {
                defs.push(def.value);
            });
            database.updateEntry(
                id,
                tradBox.value,
                simpBox.value,
                pinyinBox.value,
                defs
            );
        }
    }

    //If entry is defined, then this list element represents an existing entry.
    //If so, fill in the boxes
    if (entry) {
        tradBox.value = entry.tradChars;
        simpBox.value = entry.simpChars;
        pinyinBox.value = entry.pinyin;
        //fix the save button to the existing entry's id
        saveButton.addEventListener('click', update(entry.id));
        //a box for each definition
        for (let def of entry.defs) {
            let defElement = document.createElement('li');

            let defInput = document.createElement('input')
            defInput.value = def.definition;
            //enable the save button if the user edits a definition
            defInput.addEventListener('input', toggleSave);
            defElement.appendChild(defInput);

            let defRemove = document.createElement('button');
            defRemove.classList.add('btn');
            defRemove.innerHTML = '-';
            defRemove.addEventListener('click', function(event) {
                defElement.remove();
                toggleSave(event);
            });
            defElement.appendChild(defRemove);
    
            $(addDefLi).before(defElement); //insert it before the add definition button
        }
    } else {
        //if this element is for a new entry, have the save button create the entry
        //when it is first clicked, but then update it later on
        saveButton.addEventListener('click', function(event) {
            let defs = [];
            $(defList).find('input').each((index, def) => {
                defs.push(def.value);
            });
            let id = database.save(tradBox.value, simpBox.value, pinyinBox.value, defs, 1);

            //remove this listener and fix the button to the new entry
            $(saveButton).off('click');
            saveButton.addEventListener('click', update(id));
        });
    }

    return li;
}

function createVocabEditor() {
    //remove the vocabSheet if it already exists
    if ($('#vocabSheet').length > 0) {
        $('#vocabSheet').remove();
        $('#vocabEditorToggle').prop('innerHTML', 'Open Vocabulary Editor');
        return;
    }

    let vocabSheet = document.createElement('ul');
    vocabSheet.id = 'vocabSheet';

    //get all locally-saved definitions and create an entry form for each one
    let customVocabularies = database.getCustomDefs(1);
    for (let entry of customVocabularies) {
        let li = prepareEntry(entry);
        vocabSheet.appendChild(li);
    }

    // a button to create new entries manually
    let manEntry = document.createElement('li');
    let manEntryButton = document.createElement('button');
    manEntryButton.classList.add('btn')
    manEntryButton.innerHTML = 'Add Entry';
    manEntryButton.addEventListener('click', function(event) {
        let nLi = prepareEntry(undefined); //create a blank entry form
        $(manEntry).before(nLi);
    });
    manEntry.appendChild(manEntryButton);
    vocabSheet.appendChild(manEntry);

    $('#vocabEditor').append(vocabSheet);

    $('#vocabEditorToggle').prop('innerHTML', 'Close Vocabulary Editor');
}

$(function() {
    $('#loadDict').click(function(event) {
        if ($('#chineseText').length < 1) {
            let file = $('#fileChooser').prop('files')[0];
            fs.readFile(webUtils.getPathForFile(file), 'utf8', loadFile);
        }
    });
    $('#closeText').click(function(event) {
        $('#chineseText').remove();
        database.clearTextDefs();
    });
    $('#vocabEditorToggle').click(function(event) {
        createVocabEditor();
    });
});