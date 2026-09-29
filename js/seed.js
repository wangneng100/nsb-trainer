/* NSB 听题训练 — starter bank. Original practice questions in NSB style (not taken from real rounds),
 * written so that most of them hinge on hearing an expression's structure correctly.
 * Math goes inside $…$ in the parser's plain-text syntax. */
(function (G) {
  'use strict';
  const S = (id, type, text, answer) => ({ id: 'seed-' + id, subject: 'math', type, format: 'sa', text, answer, src: { file: '原创练习' } });
  const M = (id, type, text, choices, letter) => ({ id: 'seed-' + id, subject: 'math', type, format: 'mc', text, choices, letter, answer: `${letter}) ${choices[letter]}`, src: { file: '原创练习' } });
  const SEED = [
    S(1, 'tossup', 'What is the value of $(2x + 1)^2$ when $x = 3$?', '49'),
    S(2, 'tossup', 'What is the value of $2x^2 + 1$ when $x = 3$?', '19'),
    S(3, 'tossup', 'Evaluate $-3^2 + (-3)^2$.', '0'),
    S(4, 'tossup', 'If $a = 10$, $b = 2$, and $c = 4$, what is the value of $(a + b)/c$?', '3'),
    S(5, 'tossup', 'If $a = 10$, $b = 2$, and $c = 4$, what is the value of $a + b/c$? Give your answer as an improper fraction.', '$21/2$ (ACCEPT: 10.5)'),
    S(6, 'bonus', 'If $x = 2$ and $y = 3$, what is the value of $(xy)^2 - xy^2$?', '18'),
    M(7, 'tossup', 'Which of the following is equal to $(x^2)^3$?', { W: '$x^5$', X: '$x^6$', Y: '$x^8$', Z: '$x^9$' }, 'X'),
    S(8, 'tossup', 'What is the value of $2^(3^2)$?', '512'),
    S(9, 'tossup', 'What is the value of $sqrt(x + 16)$ when $x = 9$?', '5'),
    S(10, 'tossup', 'What is the value of $sqrt(x) + 16$ when $x = 9$?', '19'),
    S(11, 'bonus', 'What is the positive integer $n$ for which $(n - 1)! = 120$?', '6'),
    S(12, 'tossup', 'What is the value of $(3!)^2 - (2^2)!$?', '12'),
    S(13, 'tossup', 'Solve for $x$: $2^(x + 1) = 32$.', '4'),
    S(14, 'tossup', 'Solve for $x$: $2^x + 1 = 33$.', '5'),
    S(15, 'tossup', 'What is the value of $log_2(x + 4)$ when $x = 28$?', '5'),
    S(16, 'bonus', 'What is the value of $(log_3 x)^2 - log_3(x^2)$ when $x = 81$?', '8'),
    S(17, 'tossup', 'What is the value of $1/(2x)$ when $x = 1/4$?', '2'),
    M(18, 'tossup', 'If $x = 4$, which of the following expressions has the greatest value?', { W: '$(x/2)^2$', X: '$x^2/2$', Y: '$x/2^2$', Z: '$x/(2x)$' }, 'X'),
    S(19, 'tossup', 'What is the value of $|x - 7| - |x|$ when $x = -2$?', '7'),
    S(20, 'tossup', 'If $x = 10$, $y = 6$, and $z = 2$, what is the value of $x - (y - z)$?', '6'),
    S(21, 'bonus', 'Expand and simplify $(x + 2)^2 - (x - 2)^2$.', '$8x$'),
    S(22, 'tossup', 'Expand and simplify $(2x - 3)(x + 4)$.', '$2x^2 + 5x - 12$'),
    M(23, 'tossup', 'Which of the following is equal to $-2^4$?', { W: '$-16$', X: '16', Y: '$-8$', Z: '8' }, 'W'),
    S(24, 'tossup', 'What is the sum of the solutions of $x^2 - 5x + 6 = 0$?', '5'),
    S(25, 'bonus', 'If $f(x) = x^2 - 1$, what is the value of $f(x + 1) - f(x)$ when $x = 5$?', '11'),
    S(26, 'tossup', 'If $f(x) = 3x + 2$, what is the value of $f(2x)$ when $x = 3$?', '20'),
    S(27, 'tossup', 'What is the value of $(4/9)^(1/2)$?', '$2/3$'),
    S(28, 'tossup', 'What is the value of $8^(2/3)$?', '4'),
    S(29, 'tossup', 'What is the slope of the line $3x - 4y = 12$?', '$3/4$ (ACCEPT: 0.75)'),
    S(30, 'bonus', 'What is the value of $sqrt(3^2 + 4^2) - (sqrt(3^2) + sqrt(4^2))$?', '$-2$'),
    S(31, 'tossup', 'How many positive integer divisors does $2^3 * 3^2$ have?', '12'),
    S(32, 'tossup', 'What is the value of $(x + y)^2 - (x^2 + y^2)$ when $x = 3$ and $y = 5$?', '30'),
    S(33, 'bonus', 'What is the value of $x^(y + 1) - x^y + 1$ when $x = 2$ and $y = 3$?', '9'),
    S(34, 'tossup', 'What is the value of $(x^2 - 9)/(x - 3)$ when $x = 7$?', '10'),
    S(35, 'bonus', 'What is the value of $x^2 - 9/x - 3$ when $x = 3$?', '3'),
    S(36, 'tossup', 'What is the value of $sqrt(2x) * sqrt(8x)$ when $x = 5$?', '20'),
    S(37, 'tossup', 'What is the value of $1/2 + 1/3 + 1/6$?', '1'),
    M(38, 'tossup', 'Which of the following is NOT equal to $1/(2x)$ for every nonzero $x$?', { W: '$x^(-1)/2$', X: '$(2x)^(-1)$', Y: '$1/2 * x$', Z: '$0.5/x$' }, 'Y'),
    S(39, 'tossup', 'What is the remainder when $2^10$ is divided by 7?', '2'),
    S(40, 'bonus', 'Evaluate $-1^4 + (-1)^4 + (-1)^3$.', '$-1$'),
    S(41, 'tossup', 'What is the arithmetic mean of $2^10$ and $2^12$?', '2560'),
    S(42, 'bonus', 'If $x = 3$, what is the value of $(2x)!/(2x!)$?', '60'),
  ];
  G.NSB_SEED = SEED;
  if (typeof module !== 'undefined' && module.exports) module.exports = SEED;
})(typeof window !== 'undefined' ? window : globalThis);
