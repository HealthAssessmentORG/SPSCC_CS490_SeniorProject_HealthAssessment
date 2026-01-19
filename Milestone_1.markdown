# Quarter 1:

### Week 1/2: Milestone 1 – Project Plan

**Business case**
* Problem statement: Manual creation, mapping, exporting, and validation of form-based data is time-consuming, error-prone, and does not scale with large volumes needed for testing and certification processes.
* Market need: Provides an automated toolchain that converts a PDFs into a populated database, produces high-volume varied test data, and this is valid against specificed criteria. Orginizations that want to reduce hours spent on data entry and visualization.
* Stakeholders: QA teams, data engineers, compliance teams, & academics (schema design exercise)
* Benefits: Rapid creation of representative data sets, reduced manual data entry effort, and demonstrable coverage metrics for testing.
* Success criteria: Ability to generate ≥ 10,000 records within performance targets
* Cost estimate: Class hours of SPSCC students, school resources, and students off hours.
* Timeline for benefits:


**Functional and nonfunctional requirements**
* FR-001: [Random Data] - Produce 10,000+ random records per run with configurable variance and distributions; support deterministic seeding for reproducibility. (Must)
* FR-002: [Data Order] - Define a relational schema derived from the provided PDF form, including field names, types, lengths, constraints, and mapping metadata. (Must)
* FR-003: [Mapping] - Map database fields to export specification fields including the transformations, concatenation, padding, default values. Editable mapping definitions and versioned. (Must)
* FR-004: [Validation] = Verify that mapped values conform to export schema constraints (lengths, allowed values, checksums). Provide a detailed output to see spcific validation fails. (Must)
* FR-005: [Encryption of Data] - Password System (Could)
* FR-006: [Fixed-width File Generator] - Emit flat-text fixed-width files according to spec, optimized for throughput (Must)
* FR-007: [Logging] - metadata, logs, and storage. (Should)

* NR-001: Scalability: Support larger volumes (100k+)
* NR-002: Maintainability: Modular code, clear interfaces, automated tests
* NR-003: Compatibility: Support common DBs
* NR-004: Reliability / Availability: Deterministic runs with reproducible seed; rety system?

**Minimum Viable Product**
* Database that stores Pre-DHA information
* Tool with UI that exports information in fixed-width format


**Product Artifacts to produce**
* Database
* Export Tool
* Systems Documentation
* Program Documentation


**Product**


**Configuration Documentation needed**
* User guide for export Tool
* Engineer guide for database deployment


**Systems Documentation needed**
* Program documentation for export Tool
* Design documentation for the database


# Project timeline

## Quarter 1 Start | Tues Jan 13th

### Milestone 1 | Tues Jan 20th
Project Plan

### Milestone 2 | Tues Feb 3rd
Application Flow
UI Mockup
Database Design
Test Plan
Bug Tracking Plan
-provision for customer findings

### Milestone 3 | Tues Feb 17th
pre-Alpha
Dev/Ops Plan

### Milestone 4 | Tues Mar 3rd
Alpha
Dev/Ops Trial

### Milestone 5 | Tues Mar 17th
Self-Reflection
Quarter 2 Goals

## Quarter 2 Start | Mon Apr 6th

### Milestone 6 | Tues Apr 14th
Alpha 2
Bug Tracking System

### Milestone 7 | Tues Apr 28th
Beta
CI/CD Process

### Milestone 8 | Tues May 12th
Beta 2
Finalizing Docs

### Gold Master | Tues May 26th
Gold Master
Finalizing Docs

### Final Product | Tues Jun 9th
Final Product
Finalized Docs
Self-Reflection
Final Project Plan
