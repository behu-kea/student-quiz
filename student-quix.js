(() => {
    'use strict';

    // ==== Guard: if overlay already exists, just focus it and exit ============
    const QUIZ_OVERLAY_ID = 'student-quiz-overlay';
    const EXISTING = document.getElementById(QUIZ_OVERLAY_ID);
    if (EXISTING) {
        const input = EXISTING.querySelector('#student-name-guess');
        if (input) { input.focus(); input.select(); }
        return;
    }

    // ==== Utilities ===========================================================
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const normalize = (s) =>
        (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // ==== Extract students ====================================================
    const idSpans = $$('[id^="DisplayResult_SearchResultCtl_SearchDataList_lblLoginName_"]');
    const nameSpans = $$('[id^="DisplayResult_SearchResultCtl_SearchDataList_lblObjectName_"]');

    const students = idSpans.map((span, i) => ({
        id: span?.textContent?.trim(),
        name: nameSpans[i]?.textContent?.trim(),
    })).filter(s => s.id && s.name);

    if (!students.length) {
        console.warn('No students found. Check the selectors.');
    }

    // ==== Hidden iframe (loader) + visible img ================================
    let loaderIframe = document.getElementById('infoPage');
    if (!loaderIframe) {
        loaderIframe = document.createElement('iframe');
        loaderIframe.id = 'infoPage';
        document.body.appendChild(loaderIframe);
    }
    loaderIframe.setAttribute('aria-hidden', 'true');
    loaderIframe.style.display = 'none';

    const visibleImg = document.createElement('img');
    visibleImg.id = 'studentPhoto';
    visibleImg.alt = 'Student photo';
    visibleImg.decoding = 'async';
    visibleImg.loading = 'eager';

    // ==== Styles (only once) ==================================================
    if (!document.getElementById('student-quiz-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'student-quiz-style';
        styleEl.textContent = `
      #student-quiz-overlay{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(10,10,10,.75);font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
      #student-quiz-card{position:relative;background:#fff;color:#111;width:min(560px,92vw);padding:24px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.25);display:grid;gap:16px;justify-items:center}
      #student-quiz-title{font-size:1.25rem;font-weight:700}
      #studentPhoto{width:180px;height:180px;object-fit:cover;border-radius:12px;box-shadow:0 6px 16px rgba(0,0,0,.2);background:#f2f2f2}
      #quiz-controls{display:grid;grid-template-columns:1fr auto;gap:8px;width:100%}
      #student-name-guess{padding:12px 14px;border-radius:10px;border:1px solid #ddd;width:100%;font-size:16px}
      .quiz-btn{padding:12px 14px;border-radius:10px;border:none;cursor:pointer;font-weight:600;background:#111;color:#fff;transition:transform .06s ease, box-shadow .2s ease}
      .quiz-btn:active{transform:translateY(1px)}
      .quiz-btn.secondary{background:#eee;color:#111}
      .quiz-btn.primary{box-shadow:0 0 0 2px #111 inset, 0 0 0 0 rgba(0,0,0,0)}
      .pulse{animation:pulse 1.2s infinite}
      @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(0,0,0,.25)}70%{box-shadow:0 0 0 10px rgba(0,0,0,0)}100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}}
      .enter-icon{font-size:0.9em;margin-left:6px}
      #quiz-actions{display:flex;gap:8px;width:100%}
      #quiz-result{min-height:28px;font-size:1rem;font-weight:600}
      #quiz-footer{width:100%;display:flex;justify-content:space-between;align-items:center}
      #close-quiz{position:absolute;top:10px;right:10px;background:transparent;border:none;font-size:22px;line-height:1;color:#666;cursor:pointer}
      #close-quiz:hover{color:#111}
      #quiz-credits{font-size:12px;color:#666;margin-top:4px;width:100%;text-align:right}
      #quiz-credits a{color:#06c;text-decoration:underline;cursor:pointer}
    `;
        document.head.appendChild(styleEl);
    }

    // ==== Overlay UI ==========================================================
    const quizOverlayEl = document.createElement('div');
    quizOverlayEl.id = QUIZ_OVERLAY_ID;
    quizOverlayEl.innerHTML = `
    <div id="student-quiz-card" role="dialog" aria-modal="true" aria-labelledby="student-quiz-title">
      <button id="close-quiz" aria-label="Close">✕</button>
      <div id="quiz-header" style="display:flex;align-items:center;gap:10px;">
        <div id="student-quiz-title">Benjamin’s Students Quiz</div>
      </div>
      ${visibleImg.outerHTML}
      <div id="quiz-controls">
        <input id="student-name-guess" name="guess" list="student-name-guess-list"
               placeholder="What's the student's name?" autocomplete="off" />
        <button id="guess-btn" class="quiz-btn">Guess <span class="enter-icon">↵</span></button>
      </div>
      <div id="quiz-actions">
        <button id="next-btn" class="quiz-btn secondary" title="Show another student">Next</button>
        <button id="reveal-btn" class="quiz-btn secondary" title="Reveal the answer">Reveal</button>
      </div>
      <div id="quiz-result" aria-live="polite"></div>
      <div id="quiz-footer">
        <div id="quiz-score">Score: <span id="score-correct">0</span>/<span id="score-total">0</span></div>
      </div>
      <div id="quiz-credits">Lavet af <a href="https://www.linkedin.com/in/benjamindalshughes/" target="_blank" rel="noopener noreferrer">Benjamin Hughes</a></div>
      <datalist id="student-name-guess-list"></datalist>
    </div>
  `;
    document.body.appendChild(quizOverlayEl);

    // Close by clicking greyed background
    quizOverlayEl.addEventListener('click', (e) => {
        if (e.target === quizOverlayEl) closeOverlay();
    });

    // Close by Esc
    const escHandler = (e) => {
        if (e.key === 'Escape') closeOverlay();
    };
    document.addEventListener('keydown', escHandler);

    function closeOverlay() {
        document.removeEventListener('keydown', escHandler);
        quizOverlayEl.remove();
    }

    // Refs
    const imgEl = document.getElementById('studentPhoto');
    const nameInput = document.getElementById('student-name-guess');
    const guessBtn = document.getElementById('guess-btn');
    const nextBtn = document.getElementById('next-btn');
    const revealBtn = document.getElementById('reveal-btn');
    const resultEl = document.getElementById('quiz-result');
    const scoreCorrectEl = document.getElementById('score-correct');
    const scoreTotalEl = document.getElementById('score-total');
    document.getElementById('close-quiz').addEventListener('click', closeOverlay);

    // Fill datalist
    const datalist = document.getElementById('student-name-guess-list');
    students.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.name;
        datalist.appendChild(opt);
    });

    // ==== State ===============================================================
    let currentStudent = null;
    let scoreCorrect = 0;
    let scoreTotal = 0;
    let awaitingGuess = true; // Enter triggers Guess first; after guessing, Enter triggers Next

    function setPrimaryAction(which) {
        // which: 'guess' | 'next'
        const makePrimary = (btn) => {
            btn.classList.remove('secondary');
            btn.classList.add('primary', 'pulse');
        };
        const makeSecondary = (btn) => {
            btn.classList.add('secondary');
            btn.classList.remove('primary', 'pulse');
        };

        if (which === 'guess') {
            makePrimary(guessBtn);
            // ensure enter icon on Guess
            if (!guessBtn.querySelector('.enter-icon')) {
                guessBtn.insertAdjacentHTML('beforeend', ' <span class="enter-icon">↵</span>');
            }
            // remove icon from Next
            const nextIcon = nextBtn.querySelector('.enter-icon');
            if (nextIcon) nextIcon.remove();
            makeSecondary(nextBtn);
            awaitingGuess = true;
        } else {
            makePrimary(nextBtn);
            // add enter icon to Next
            if (!nextBtn.querySelector('.enter-icon')) {
                nextBtn.insertAdjacentHTML('beforeend', ' <span class="enter-icon">↵</span>');
            }
            // remove icon from Guess
            const guessIcon = guessBtn.querySelector('.enter-icon');
            if (guessIcon) guessIcon.remove();
            makeSecondary(guessBtn);
            awaitingGuess = false;
        }
    }

    // ==== Load student image via hidden iframe ================================
    function loadStudentImage(student) {
        const url = `../include/InfoPage.aspx?login=${encodeURIComponent(student.id)}&type=S`;
        return new Promise((resolve, reject) => {
            const onLoad = () => {
                try {
                    const doc = loaderIframe.contentDocument || loaderIframe.contentWindow?.document;
                    if (!doc) throw new Error('No iframe document');
                    const img = doc.querySelector('img');
                    if (!img) return reject(new Error('No <img> found in iframe'));
                    resolve(img.src); // absolute URL
                } catch (err) {
                    reject(err);
                } finally {
                    loaderIframe.removeEventListener('load', onLoad);
                }
            };
            loaderIframe.addEventListener('load', onLoad, { once: true });
            loaderIframe.src = url;
        });
    }

    async function showStudent(student) {
        currentStudent = student;
        resultEl.textContent = '';
        nameInput.value = '';
        imgEl.src = '';
        imgEl.alt = `Loading student photo`;
        setPrimaryAction('guess');
        try {
            const imgSrc = await loadStudentImage(student);
            imgEl.src = imgSrc;
        } catch (e) {
            console.warn('Failed to extract image from iframe:', e);
            resultEl.textContent = 'Could not load image. Try Next.';
            setPrimaryAction('next'); // if we can’t show image, push user to Next
        }
    }

    // ==== Guess handling ======================================================
    function checkAnswer() {
        if (!currentStudent) return;
        const guess = normalize(nameInput.value);
        const actual = normalize(currentStudent.name);
        scoreTotal += 1;
        if (guess && guess === actual) {
            scoreCorrect += 1;
            resultEl.textContent = 'Correct 🎉';
        } else {
            resultEl.textContent = `Wrong 😭 — It’s ${currentStudent.name}`;
        }
        scoreCorrectEl.textContent = String(scoreCorrect);
        scoreTotalEl.textContent = String(scoreTotal);
        nameInput.focus(); nameInput.select();
        setPrimaryAction('next'); // after guessing, Enter triggers Next
    }

    function nextStudent() {
        if (!students.length) return;
        let candidate = pickRandom(students);
        if (currentStudent && candidate.id === currentStudent.id) {
            candidate = pickRandom(students);
        }
        showStudent(candidate);
    }

    // ==== Events ==============================================================
    guessBtn.addEventListener('click', checkAnswer);
    nextBtn.addEventListener('click', nextStudent);
    revealBtn.addEventListener('click', () => {
        if (currentStudent) resultEl.textContent = `It’s ${currentStudent.name}`;
    });

    // Enter in input: Guess or Next depending on state
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (awaitingGuess) checkAnswer(); else nextStudent();
        }
    });

    // ==== Start ===============================================================
    nextStudent();
    nameInput.focus();
})();
