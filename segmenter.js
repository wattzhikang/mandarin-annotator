'use strict';

const hanRegex = /\p{Script=Han}/u;

function isHan(char) {
    return hanRegex.test(char);
}

/*
Greedily segments a run of Han characters into words. Starting from each
position, it keeps extending the candidate word one character at a time as
long as the longer candidate is found in the dictionary, then commits the
longest match found (falling back to a single character if not even the
two-character candidate matched) and starts over from the next character.
*/
function segmentHanRun(chars, wordExists) {
    let tokens = [];
    let i = 0;
    while (i < chars.length) {
        let longestMatchEnd = i + 1;
        let end = i + 2;
        while (end <= chars.length && wordExists(chars.slice(i, end).join(''))) {
            longestMatchEnd = end;
            end++;
        }
        tokens.push(chars.slice(i, longestMatchEnd).join(''));
        i = longestMatchEnd;
    }
    return tokens;
}

//splits a single line (paragraph) of unsegmented text into space-separated words
function segmentLine(line, wordExists) {
    let tokens = [];
    let i = 0;
    while (i < line.length) {
        if (isHan(line[i])) {
            let j = i;
            while (j < line.length && isHan(line[j])) {
                j++;
            }
            tokens.push(...segmentHanRun(line.slice(i, j).split(''), wordExists));
            i = j;
        } else if (/\s/.test(line[i])) {
            i++;
        } else {
            tokens.push(line[i]);
            i++;
        }
    }
    return tokens;
}

//segments a whole unsegmented text (one paragraph per line) using the
//longest-match-in-dictionary algorithm, returning text in the same
//one-paragraph-per-line, space-separated-word format as a .seg file's body
function segmentText(rawText, wordExists) {
    return rawText
        .split('\n')
        .map(line => segmentLine(line.trim(), wordExists).join(' '))
        .join('\n');
}

module.exports = { segmentText };
