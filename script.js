"use strict";

const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector("#site-nav");

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.addEventListener("click", (event) => {
    if (event.target.matches("a")) {
      siteNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
}

const canvas = document.querySelector("#game-canvas");
const context = canvas ? canvas.getContext("2d") : null;
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#best-score");
const statusElement = document.querySelector("#game-status");
const startButton = document.querySelector("#start-game");
const pauseButton = document.querySelector("#pause-game");
const restartButton = document.querySelector("#restart-game");
const directionButtons = document.querySelectorAll("[data-direction]");

const GRID_SIZE = 18;
const STEP_MS = 180;
const COIN_INTERVAL_MS = 3000;
const COIN_LIFETIME_MS = 2600;
const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

let snake = [];
let food = { x: 13, y: 9 };
let coin = null;
let direction = DIRECTIONS.right;
let queuedDirection = DIRECTIONS.right;
let score = 0;
let bestScore = readBestScore();
let gameState = "ready";
let frameId = null;
let lastFrameTime = 0;
let stepAccumulator = 0;
let nextCoinAt = 0;

function readBestScore() {
  try {
    return Number.parseInt(window.localStorage.getItem("eunhye-best-score"), 10) || 0;
  } catch (error) {
    return 0;
  }
}

function writeBestScore() {
  try {
    window.localStorage.setItem("eunhye-best-score", String(bestScore));
  } catch (error) {
    // Storage can be unavailable in private browsing; the game still works.
  }
}

function updateScoreDisplay() {
  if (scoreElement) scoreElement.textContent = String(score);
  if (bestScoreElement) bestScoreElement.textContent = String(bestScore);
}

function setStatus(message) {
  if (statusElement) statusElement.textContent = message;
}

function resetGame() {
  snake = [{ x: 9, y: 9 }, { x: 8, y: 9 }, { x: 7, y: 9 }];
  direction = DIRECTIONS.right;
  queuedDirection = DIRECTIONS.right;
  food = placeFood();
  coin = null;
  score = 0;
  gameState = "ready";
  stepAccumulator = 0;
  nextCoinAt = performance.now() + COIN_INTERVAL_MS;
  updateScoreDisplay();
  draw();
  setStatus("시작을 눌러주세요");
  if (startButton) startButton.disabled = false;
  if (pauseButton) pauseButton.disabled = true;
}

function placeFood() {
  const available = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!snake.some((segment) => segment.x === x && segment.y === y)) available.push({ x, y });
    }
  }
  return available[Math.floor(Math.random() * available.length)] || { x: 0, y: 0 };
}

function placeCoin() {
  const available = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const occupied = snake.some((segment) => segment.x === x && segment.y === y)
        || (food.x === x && food.y === y);
      if (!occupied) available.push({ x, y });
    }
  }
  return available[Math.floor(Math.random() * available.length)] || null;
}

function updateCoin(timestamp) {
  if (coin && timestamp >= coin.expiresAt) coin = null;
  if (!coin && timestamp >= nextCoinAt) {
    const position = placeCoin();
    if (position) coin = { ...position, expiresAt: timestamp + COIN_LIFETIME_MS };
    nextCoinAt = timestamp + COIN_INTERVAL_MS;
  }
}

function setDirection(nextDirection) {
  const next = DIRECTIONS[nextDirection];
  if (!next || (direction.x + next.x === 0 && direction.y + next.y === 0)) return;
  queuedDirection = next;
}

function startGame() {
  if (gameState === "running") return;
  if (gameState === "gameover") resetGame();
  gameState = "running";
  setStatus("진행 중");
  if (startButton) startButton.disabled = true;
  if (pauseButton) pauseButton.disabled = false;
  lastFrameTime = performance.now();
  frameId = requestAnimationFrame(gameLoop);
}

function pauseGame() {
  if (gameState !== "running") return;
  gameState = "paused";
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  if (pauseButton) pauseButton.disabled = true;
  if (startButton) startButton.disabled = false;
  setStatus("일시정지");
}

function gameOver() {
  gameState = "gameover";
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  if (pauseButton) pauseButton.disabled = true;
  if (startButton) startButton.disabled = false;
  if (score > bestScore) {
    bestScore = score;
    writeBestScore();
    updateScoreDisplay();
  }
  setStatus("게임 오버 · 다시 시작하세요");
  draw();
}

function moveSnake() {
  direction = queuedDirection;
  const head = snake[0];
  const nextHead = { x: head.x + direction.x, y: head.y + direction.y };
  const hitWall = nextHead.x < 0 || nextHead.x >= GRID_SIZE || nextHead.y < 0 || nextHead.y >= GRID_SIZE;
  const hitSelf = snake.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);
  if (hitWall || hitSelf) {
    gameOver();
    return;
  }
  snake.unshift(nextHead);
  if (nextHead.x === food.x && nextHead.y === food.y) {
    score += 1;
    if (score > bestScore) bestScore = score;
    updateScoreDisplay();
    food = placeFood();
  } else {
    snake.pop();
  }
  if (coin && nextHead.x === coin.x && nextHead.y === coin.y) {
    const bonus = Math.floor(Math.random() * 10) + 1;
    score += bonus;
    if (score > bestScore) bestScore = score;
    coin = null;
    nextCoinAt = performance.now() + COIN_INTERVAL_MS;
    updateScoreDisplay();
    setStatus(`동전 획득 +${bonus}점`);
  }
  draw();
}

function gameLoop(timestamp) {
  if (gameState !== "running") return;
  const elapsed = Math.min(timestamp - lastFrameTime, 100);
  lastFrameTime = timestamp;
  stepAccumulator += elapsed;
  updateCoin(timestamp);
  while (stepAccumulator >= STEP_MS && gameState === "running") {
    moveSnake();
    stepAccumulator -= STEP_MS;
  }
  if (gameState === "running") frameId = requestAnimationFrame(gameLoop);
}

function drawRoundedCell(x, y, size, radius, color) {
  const left = x + 2;
  const top = y + 2;
  const width = size - 4;
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(left, top, width, width, radius);
  context.fill();
}

function draw() {
  if (!context || !canvas) return;
  const cellSize = canvas.width / GRID_SIZE;
  context.fillStyle = "#fffafd";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(234, 223, 236, .55)";
  context.lineWidth = 1;
  for (let i = 1; i < GRID_SIZE; i += 1) {
    const position = i * cellSize;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, canvas.height);
    context.moveTo(0, position);
    context.lineTo(canvas.width, position);
    context.stroke();
  }
  const foodCenterX = food.x * cellSize + cellSize / 2;
  const foodCenterY = food.y * cellSize + cellSize / 2;
  context.fillStyle = "#f28fa5";
  context.beginPath();
  context.arc(foodCenterX, foodCenterY + 1, cellSize * .3, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#6f9f73";
  context.fillRect(foodCenterX - 1, foodCenterY - cellSize * .42, 2, cellSize * .15);
  if (coin) {
    const centerX = coin.x * cellSize + cellSize / 2;
    const centerY = coin.y * cellSize + cellSize / 2;
    context.fillStyle = "#f2c66d";
    context.beginPath();
    context.arc(centerX, centerY, cellSize * .32, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#805d34";
    context.font = `${Math.max(9, cellSize * .42)}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("+", centerX, centerY);
  }
  snake.forEach((segment, index) => {
    drawRoundedCell(segment.x * cellSize, segment.y * cellSize, cellSize, 8, index === 0 ? "#75b99e" : "#b9e4d2");
  });
  const head = snake[0];
  if (head) {
    context.fillStyle = "#302d3d";
    const faceX = head.x * cellSize + cellSize / 2;
    const faceY = head.y * cellSize + cellSize / 2;
    const eyeOffsetX = direction.x === 0 ? cellSize * .17 : direction.x * cellSize * .12;
    const eyeOffsetY = direction.y === 0 ? cellSize * .15 : direction.y * cellSize * .12;
    context.beginPath();
    context.arc(faceX - eyeOffsetX, faceY - eyeOffsetY, 2.5, 0, Math.PI * 2);
    context.arc(faceX + eyeOffsetX, faceY + eyeOffsetY, 2.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#744d68";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(faceX + direction.x * cellSize * .12, faceY + direction.y * cellSize * .12, cellSize * .12, 0, Math.PI);
    context.stroke();
  }
}

const keyDirections = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right"
};

document.addEventListener("keydown", (event) => {
  const nextDirection = keyDirections[event.key];
  if (!nextDirection) return;
  event.preventDefault();
  setDirection(nextDirection);
});

directionButtons.forEach((button) => {
  button.addEventListener("click", () => setDirection(button.dataset.direction));
});

if (startButton) startButton.addEventListener("click", startGame);
if (pauseButton) pauseButton.addEventListener("click", pauseGame);
if (restartButton) restartButton.addEventListener("click", resetGame);

resetGame();
