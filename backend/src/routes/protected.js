const express = require("express");

const router = express.Router();

function requireSession(req, res, next) {
  if (!req.session.student) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

router.get("/me", requireSession, (req, res) => {
  res.json({ student: req.session.student });
});

router.get("/dashboard", requireSession, (req, res) => {
  const student = req.session.student;
  res.json({
    student,
    announcements: [
      {
        title: "Semester Registration Open",
        body: "Course registration for the upcoming semester is now open until the end of the month.",
        date: "2026-07-20",
      },
      {
        title: "Library Extended Hours",
        body: "The central library will remain open until midnight during exam weeks.",
        date: "2026-07-15",
      },
      {
        title: "Verifiable Credential Login Rollout",
        body: "The student portal now supports secure, passwordless login via your Student ID credential.",
        date: "2026-07-10",
      },
    ],
    quickStats: [
      { label: "Department", value: student.department },
      { label: "Student ID", value: student.student_id },
      { label: "Status", value: "Active" },
    ],
  });
});

router.get("/profile", requireSession, (req, res) => {
  const student = req.session.student;
  res.json({
    student,
    credential: {
      type: "Student ID",
      issuer: "BRAC University",
      fields: ["student_name", "student_id", "department", "email"],
    },
  });
});

module.exports = { router, requireSession };
