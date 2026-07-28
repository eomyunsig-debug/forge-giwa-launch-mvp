const [major = Number.NaN, minor = Number.NaN] = process.versions.node
  .split(".")
  .map(Number);

const supported = (major > 22 || (major === 22 && minor >= 22)) && major < 25;

if (!supported) {
  console.error(
    [
      `Forge는 Node 22.22 이상, 25 미만이 필요합니다. 현재 버전: ${process.versions.node}.`,
      "Node 25에서는 better-sqlite3 ABI가 맞지 않아 인덱서 테스트가 연쇄 실패합니다.",
      "Node 24 LTS로 전환한 뒤 다시 실행하세요.",
    ].join("\n"),
  );
  process.exit(1);
}
