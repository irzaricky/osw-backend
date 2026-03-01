import express from "express";
import jobModule from "../../module/master-data/job.js";
import auth from "../../class/auth.class.js";

const router = express.Router();

router.get("/dd-job-type", auth.sessionChecker, async (req, res) => {
  await jobModule.getJobTypes(req, res);
});

router.get("/dropdown", auth.sessionChecker, async (req, res) => {
  await jobModule.getDropdown(req, res);
});

router.get("/download", auth.sessionChecker, async (req, res) => {
  await jobModule.download(req, res);
});

router.post("/upload", auth.sessionChecker, async (req, res) => {
  await jobModule.upload(req, res);
});

router.get("/", auth.sessionChecker, async (req, res) => {
  await jobModule.list(req, res);
});

router.post("/", auth.sessionChecker, async (req, res) => {
  await jobModule.add(req, res);
});

router.put("/:id", auth.sessionChecker, async (req, res) => {
  await jobModule.update(req, res);
});

router.delete("/:id", auth.sessionChecker, async (req, res) => {
  await jobModule.delete(req, res);
});

export default router;
