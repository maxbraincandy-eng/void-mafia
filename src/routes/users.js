const express = require("express");
const { getUserProfile } = require("../services/UserService");

function createUsersRouter(ctx) {
  const router = express.Router();

  router.get("/:userId/profile", async (req, res) => {
    try {
      const profile = await getUserProfile(ctx, req.params.userId);

      if (!profile) {
        return res.status(404).json({
          ok: false,
          error: "მოთამაშე ვერ მოიძებნა."
        });
      }

      res.json({
        ok: true,
        profile
      });
    } catch (err) {
      console.error("user profile failed:", err);

      res.status(500).json({
        ok: false,
        error: "პროფილის წამოღება ვერ მოხერხდა."
      });
    }
  });

  return router;
}

module.exports = {
  createUsersRouter
};
