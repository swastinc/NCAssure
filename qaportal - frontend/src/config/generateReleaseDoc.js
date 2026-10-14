import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import { saveAs } from "file-saver";

export const generateReleaseDoc = async () => {
  const doc = new Document({
    sections: [
      {
        children: [
          /* =========================
             1. Project Name
          ========================= */
          new Paragraph({
            text: "1. Project Name: Internal Release",
            heading: HeadingLevel.HEADING_1,
          }),

          new Paragraph({
            text: "1.1 Purpose of the Release",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph(
            "This document is intended to formally hand over the build from the Development team to the QA team for validation and testing. It provides build-level information, scope of changes, testing expectations, and known limitations."
          ),

          new Paragraph({
            text: "1.2 Build Summary",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph("Iteration: V1"),
          new Paragraph("Build No: 1.1"),
          new Paragraph("Date:"),
          new Paragraph("Scope:"),
          new Paragraph("Environment:"),
          new Paragraph("Audience: NC QA Team"),
          new Paragraph("Notes:"),

          new Paragraph("------------------------------------------------------------"),

          /* =========================
             2. Build Specific Details
          ========================= */
          new Paragraph({
            text: "2. Build Specific Details",
            heading: HeadingLevel.HEADING_1,
          }),

          new Paragraph({
            text: "2.1 Current Build Details",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph("Release ID / Version:"),
          new Paragraph("Release Environment: QA"),
          new Paragraph("Build Type: Bug Fix & Minor Enhancements"),
          new Paragraph("Dev Owner:"),
          new Paragraph("QA Owner: QA Team"),
          new Paragraph("CR / Work Items: New feature added / Bug fixes"),

          new Paragraph({
            text: "2.2 Build Overview",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph(
            "This build description briefly explains the changes included in the release. It provides a short summary of application-level updates for this release."
          ),

          new Paragraph({
            text: "2.3 QA Scope",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: "2.3.1 Features / Modules (From Dev)",
            heading: HeadingLevel.HEADING_3,
          }),
          new Paragraph("• Feature A"),
          new Paragraph("• Feature B"),
          new Paragraph("• Bug Fixes"),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, "Internal_Release_Document.docx");
};
