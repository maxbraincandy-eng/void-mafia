const { AUDIO_CUE } = require("./constants");

const cueMeta = {
  [AUDIO_CUE.START]: { tone: "major", label: "თამაში დაიწყო" },
  [AUDIO_CUE.ROLE]: { tone: "spark", label: "როლები დარიგდა" },
  [AUDIO_CUE.NIGHT]: { tone: "dark", label: "ღამე დაიწყო" },
  [AUDIO_CUE.DAY]: { tone: "bright", label: "დღე დაიწყო" },
  [AUDIO_CUE.INDIVIDUAL]: { tone: "tick", label: "სიტყვა მოთამაშეს" },
  [AUDIO_CUE.NOMINATION]: { tone: "pulse", label: "დასახელების ფაზა" },
  [AUDIO_CUE.VOTE]: { tone: "countdown", label: "ხმის მიცემა" },
  [AUDIO_CUE.RESULT]: { tone: "hit", label: "შედეგი" },
  [AUDIO_CUE.LAST_WORDS]: { tone: "low", label: "ბოლო სიტყვა" },
  [AUDIO_CUE.WIN]: { tone: "win", label: "გამარჯვება" },
  [AUDIO_CUE.ERROR]: { tone: "error", label: "შეცდომა" }
};

module.exports = { cueMeta };
