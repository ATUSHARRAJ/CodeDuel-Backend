const githubCallback = async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.redirect("/login?error=NoCode");
  }

  // 👇 existing POST API ko internally call kar rahe hain
  req.body = { code };

  // existing controller reuse
  return require("./authController").githubLogin(req, res);
};

module.exports = { githubCallback };
