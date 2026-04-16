USE [DD2975_PreDHA];
GO

INSERT INTO FIELD (field_code, field_name) VALUES
/*
field codes are as follows:
X_YY_ZZ
X = deployer or assessor (D or A)
YY = group of fields
ZZ = single field
*/

-- D_00 deployer identifying information
('D_00_00', 'Deployer Last Name'),
('D_00_01', 'Deployer First Name'),
('D_00_02', 'Deployer Middle Initial'),
('D_00_04', 'Deployer DoD ID Number'),
('D_00_05', 'Deployer Today''s Date'),
('D_00_06', 'Deployer Date of Birth'),
('D_00_07', 'Deployer Gender'),
('D_00_08', 'Deployer Service Branch'),
('D_00_09', 'Deployer Component'),
('D_00_10', 'Deployer Pay Grade'),
('D_00_11', 'Deployer Unit Name'),
('D_00_12', 'Deployer Duty Station/Location'),

-- D_01 deployer contact information
('D_01_00', 'Deployer Phone Number'),
('D_01_01', 'Deployer Cell Phone Number'),
('D_01_02', 'Deployer DSN'),
('D_01_03', 'Deployer Email'),
('D_01_04', 'Deployer Mailing Address'),

-- D_02 deployer point of contact information
('D_02_00', 'Deployer Point of Contact Name'),
('D_02_01', 'Deployer Point of Contact Phone Number'),
('D_02_02', 'Deployer Point of Contact Email'),
('D_02_03', 'Deployer Point of Contact Mailing Address'),

-- D_03 deployer upcoming deployment
('D_03_00', 'Estimated Date of Upcoming Deployment'),
('D_03_01', 'Country of Upcoming Deployment'),
('D_03_02', 'Name of Operation (if known)'),
('D_03_03', 'Total Number of Deployments in the Past 5 Years'),
('D_03_04', 'Primary Country of Last Deployment'),
('D_03_05', 'Date Departed Theater/Deployment Location'),

-- D_10 deployer medical responses
('D_10_00', 'Overall, how would you rate your health during the PAST MONTH?'),
('D_10_01', '(Air Force/Space Force) Do you CURRENTLY have an Assignment Limitation Code C?\n(All others) Are you CURRENTLY on a profile, limited duty, waiting on a MOS/Medical Retention Board (MMRB) decision, or being referred to a medical evaluation board (MEB) or physical evaluation board (PEB)?'),
('D_10_02', 'How often do you smoke tobacco (for example: cigarettes, cigars, pipe or hookah)?'),
('D_10_03', 'FEMALES ONLY – Which of the following best describes you?'),
('D_10_04', 'FEMALES ONLY – Do you wish to receive contraceptive counseling?'),
('D_10_05', 'In the PAST YEAR did you receive care for a head injury?'),
('D_10_06', 'What prescription or over-the-counter medications (including herbals/supplements) for sleep, pain, combat stress, or mental health conditions are you CURRENTLY taking?'),
('D_10_07', 'In the PAST YEAR did you receive care for any mental health condition or concern such as, but not limited to, post traumatic stress disorder (PTSD), depression, anxiety disorder, alcohol abuse or substance abuse?'),
-- During the PAST MONTH, how much have you been bothered by any of the following problems?
('D_10_08', 'Noises in your head or ears (such as ringing, buzzing, crickets, humming, tone, etc.)'),
('D_10_09', 'Trouble hearing'),
('D_10_10', 'How often do you have a drink containing alcohol?'),
('D_10_11', 'How many drinks containing alcohol do you have on a typical day when you are drinking?'),
('D_10_12', 'How often do you have six or more drinks on one occasion?'),
-- Have you ever had any experience that was so frightening, horrible, or upsetting that, in the PAST MONTH, you:
('D_10_13', 'Have had nightmares about it or thought about it when you did not want to?'),
('D_10_14', 'Tried hard not to think about it or went out of your way to avoid situations that remind you of it?'),
('D_10_15', 'Were constantly on guard, watchful or easily startled?'),
('D_10_16', 'Felt numb or detached from others, activities, or your surroundings?'),
('D_10_17', 'Felt guilty or unable to stop blaming yourself or others for the event(s) or any problems the event(s) may have caused?'),

-- D_11 stressful life experiences
-- Below is a list of problems and complaints that people sometimes have in response to stressful life experiences. Please read each question carefully and check the box for how much you have been bothered by that problem in the PAST MONTH. Please answer all items.
('D_11_00', 'Repeated, disturbing memories, thoughts, or images of a stressful experience from the past?'),
('D_11_01', 'Repeated, disturbing dreams of a stressful experience from the past?'),
('D_11_02', 'Suddenly acting or feeling as if a stressful experience were happening again (as if you were reliving it)?'),
('D_11_03', 'Feeling very upset when something reminded you of a stressful experience from the past?'),
('D_11_04', 'Having physical reactions (e.g., heart pounding, trouble breathing, or sweating) when something reminded you of a stressful experience from the past?'),
('D_11_05', 'Avoid thinking about or talking about a stressful experience from the past or avoid having feelings related to it?'),
('D_11_06', 'Avoid activities or situations because they remind you of a stressful experience from the past?'),
('D_11_07', 'Trouble remembering important parts of a stressful experience from the past?'),
('D_11_08', 'Loss of interest in things that you used to enjoy?'),
('D_11_09', 'Feeling distant or cut off from other people?'),
('D_11_10', 'Feeling emotionally numb or being unable to have loving feelings for those close to you?'),
('D_11_11', 'Feeling as if your future will somehow be cut short?'),
('D_11_12', 'Trouble falling or staying asleep?'),
('D_11_13', 'Feeling irritable or having angry outbursts?'),
('D_11_14', 'Having difficulty concentrating?'),
('D_11_15', 'Being “super alert” or watchful, on guard?'),
('D_11_16', 'Feeling jumpy or easily startled?'),
('D_11_17', 'How difficult have these problems (11f. through 11v.) made it for you to do your work, take care of things at home, or get along with other people?'),

-- D_12 depression screening
-- Over the LAST 2 WEEKS, how often have you been bothered by the following problems?
('D_12_00', 'Little interest or pleasure in doing things?'),
('D_12_01', 'Feeling down, depressed, or hopeless?'),
-- NOTE: If 12a. or 12b. are marked “More than half the days” or “Nearly every day,” continue to answer items 12c. through 12i.
('D_12_02', 'Trouble falling/staying asleep, sleep too much.'),
('D_12_03', 'Feeling tired or having little energy.'),
('D_12_04', 'Poor appetite or overeating.'),
('D_12_05', 'Feeling bad about yourself – or that you are a failure or have let yourself or your family down.'),
('D_12_06', 'Trouble concentrating on things, such as reading the newspaper or watching television.'),
('D_12_07', 'Moving or speaking so slowly that other people could have noticed. Or the opposite – being so fidgety that you have been moving around a lot more than usual.'),
('D_12_08', 'How difficult have these problems (12a.through12h.) made it for you to do your work, take care of things at home, or get along with other people?'),

-- D_20 misc
('D_20_00', 'Over the PAST MONTH, what major life stressors,  if any, have you experienced that are a cause of significant concern or make it difficult for you to do your work, take care of things at home, or get along with other people? (Mark all that apply.)'),
('D_20_01', 'Are you currently in treatment or getting professional help for this concern?'),
('D_20_02', 'Are you concerned about any other health condition(s) or health risk exposures not already addressed?'),

-- A_00 assessor information
('A_00_00', 'Assessor Last Name'),
('A_00_01', 'Assessor First Name'),
('A_00_02', 'Assessor Middle Initial'),
('A_00_03', 'Assessor Service Branch'),
('A_00_04', 'Assessor Component'),
('A_00_05', 'Assessor Title'),
('A_00_06', 'Assessor Email'),
('A_00_07', 'Assessor Facility'),
('A_00_08', 'Assessor Unit'),
('A_00_09', 'Assessor Address'),
('A_00_10', 'Assessor State'),
('A_00_11', 'Assessor Zip Code'),
('A_00_12', 'Assessor Commercial Phone Number'),

-- A_10 mental health assessment
('A_10_00', 'Deployer is deploting to'),
('A_10_01', 'Has deployed x times before in the past five years.'),
('A_10_02', 'Last returned'),

-- A_11 Address concerns identified on deployer questions 1 through 8.
('A_11_01', 'Self health rating: not answered / yes response'),
('A_11_02', 'Self health rating: deployer''s response'),
('A_11_03', 'Self health rating: provider''s comments (if indicated)'),
('A_11_04', 'MEB or PEB: not answered / yes response'),
('A_11_05', 'MEB or PEB: deployer''s response'),
('A_11_06', 'MEB or PEB: provider''s comments (if indicated)'),
('A_11_07', 'Medical, dental, or mental health concern: not answered / yes response'),
('A_11_08', 'Medical, dental, or mental health concern: deployer''s response'),
('A_11_09', 'Medical, dental, or mental health concern: provider''s comments (if indicated)'),
-- Pregnany: SM response
('A_11_10', 'I am or may be pregnant: not answered / yes response'),
('A_11_11', 'I am or may be pregnant: deployer''s response'),
('A_11_12', 'I am or may be pregnant: provider''s comments (if indicated)'),
('A_11_13', 'I was pregnant or just delivered within the past 6-months: not answered / yes response'),
('A_11_14', 'I was pregnant or just delivered within the past 6-months: deployer''s response'),
('A_11_15', 'I was pregnant or just delivered within the past 6-months: provider''s comments (if indicated)'),
('A_11_16', 'I was pregnant and delivered 6-12 months ago: not answered / yes response'),
('A_11_17', 'I was pregnant and delivered 6-12 months ago: deployer''s response'),
('A_11_18', 'I was pregnant and delivered 6-12 months ago: provider''s comments (if indicated)'),
('A_11_19', 'I am not pregnant now, and was not pregnant or delivered in past 12 months: not answered / yes response'),
('A_11_20', 'I am not pregnant now, and was not pregnant or delivered in past 12 months: deployer''s response'),
('A_11_21', 'I am not pregnant now, and was not pregnant or delivered in past 12 months: provider''s comments (if indicated)'),
('A_11_22', 'Contraceptive counseling: not answered / yes response'),
('A_11_23', 'Contraceptive counseling: deployer''s response'),
('A_11_24', 'Contraceptive counseling: provider''s comments (if indicated)'),
('A_11_25', 'Head injury: not answered / yes response'),
('A_11_26', 'Head injury: deployer''s response'),
('A_11_27', 'Head injury: provider''s comments (if indicated)'),
('A_11_28', 'Medications: not answered / yes response'),
('A_11_29', 'Medications: deployer''s response'),
('A_11_30', 'Medications: provider''s comments (if indicated)'),
('A_11_31', 'History of mental health care: not answered / yes response'),
('A_11_32', 'History of mental health care: deployer''s response'),
('A_11_33', 'History of mental health care: provider''s comments (if indicated)'),

-- Hearing and tinnitus as reported in deployer question 9.
('A_12_00', 'Did deployer mark he/she bothered a little or a lot in the past month by “noises in head or ears” or “trouble hearing”?'),
('A_12_01', 'If yes, referral indicated?'),

-- Alcohol use as reported in deployer question 10.
('A_13_01', 'Deployer’s AUDIT-C screening score was'),
('A_13_02', 'Number of drinks per week'),
('A_13_03', 'Maximum number of drinks per occasion'),
('A_13_04', 'Referral indicated for evaluation?'),

-- PTSD screening as reported in deployer question 11.
('A_14_00', 'Did deployer mark yes on three or more of questions 11a. through 11e?'),
('A_14_01', 'If yes, deployer’s responses to questions 11f. through 11v. resulted in a PCL-C score of'),
('A_14_02', 'Self-Reported Level of Functioning'),
('A_14_03', 'Referral indicated?'),

-- Depression screening as reported in deployer question 12.
('A_15_00', 'Did deployer mark “More than half the days” or “Nearly every day” on question 12a. or 12b.?'),
('A_15_01', 'If yes, deployer’s responses to questions 12a. through 12h. resulted in a total PHQ-8 score of'),
('A_15_02', 'Self-Reported Level of Functioning'),
('A_15_03', 'Referral indicated?'),

-- Major life stressor as reported on deployer question 13
('A_16_00', 'Did deployer mark they have a concern or a difficulty with a major life stressor?'),
('A_16_01', 'If yes, ask additional questions to determine level of problem:'),
('A_16_02', 'Consider need for referral. Referral indicated?'),

-- Suicide risk evaluation
('A_17_00', 'Ask “Over the PAST MONTH, have you wished you were dead or wished you could go to sleep and not wake up?”'),
('A_17_01', 'Ask “Have you actually had any thoughts of killing yourself?”'),
('A_17_02', 'Ask “Over the PAST MONTH, have you been thinking about how you might do this?”'),
('A_17_03', 'Ask “Over the past month, have you had these thoughts and had some intention of acting on them?”'),
('A_17_04', 'Ask “Over the past month, have you started to work out or worked out the details of how to kill yourself?”'),
('A_17_05', 'Ask At any time in the past month, did you intend to carry out this plan?”'),
('A_17_06', 'Ask “In your lifetime, have you ever done anything, started to do anything, or prepared to do anything to end your life?”'),
('A_17_07', 'Ask “Was this within the past three months?”'),
('A_17_08', 'Conduct further risk assessment (e.g., interpersonal conflicts, social isolation, alcohol/substance abuse, hopelessness,  severe agitation/anxiety, diagnosis of depression or other psychiatric disorder, recent loss, financial stress, legal disciplinary  problems or serious physical illness).'),
('A_17_09', 'Does deployer pose a current risk for harm to self?'),

-- Violence/harm risk evaluation
('A_18_00', 'Ask, “Over the past month have you had thoughts or concerns that you might hurt or lose control with someone?”'),
('A_18_01', 'If yes, ask additional questions to determine extent of problem (target, plan, intent, past history)'),
('A_18_02', 'Does member pose a current risk to others?'),

-- Medical History Review
('A_19_00', 'Medical History Review – if available, hard copy and/or electronic health records (including DD2766 and SF-600 entries, and most recent past deployment health assessments).'),
('A_19_01', 'Significant findings related to ability to deploy:'),
('A_19_02', 'Evidence of deployment limiting conditions or medications?'),

-- final page
-- Deployer issues with this assessment (mark as appropriate):
('A_20_00', 'Deployer declined to complete form'),
('A_20_01', 'Deployer declined to complete interview/assessment'),
-- Summary of provider’s identified concerns needing referral
('A_21_00', 'None Identified'),
('A_21_01', 'Physical health'),
('A_21_02', 'Dental health'),
('A_21_03', 'Alcohol use'),
('A_21_04', 'PTSD symptoms'),
('A_21_05', 'Depression symptoms'),
('A_21_06', 'Mental health symptoms'),
('A_21_07', 'Risk of self-harm'),
('A_21_08', 'Risk of violence'),
('A_21_09', 'Other (list):'),
-- Recommended referral(s)
('A_22_00', 'Primary Care, Family Practice, Internal Medicine'),
('A_22_01', 'Behavioral Health in Primary Care'),
('A_22_02', 'Mental Health Specialty Care'),
('A_22_03', 'Dental'),
('A_22_04', 'Other specialty care:'),
('A_22_05', 'Audiology'),
('A_22_06', 'Dermatology'),
('A_22_07', 'OB/GYN'),
('A_22_08', 'Physical Therapy'),
('A_22_09', 'TBI/Rehab Med'),
('A_22_10', 'Podiatry'),
('A_22_11', 'Other (list):'),
('A_22_12', 'Case Manager / Care Manager'),
('A_22_13', 'Substance Abuse Program'),
('A_22_14', 'Other (list):'),
('A_23_00', 'Comments'),

-- 
('A_24_00', 'Medical assessment/disposition:'),
('A_24_01', 'Comments'),

-- Supplemental services recommended / information provided
('A_25_00', 'Appointment Assistance'),
('A_25_01', 'Contract Support'),
('A_25_02', 'Community Service'),
('A_25_03', 'Chaplain'),
('A_25_04', 'Health Education and Information'),
('A_25_05', 'Health Care Benefits and Resources Information'),
('A_25_06', 'In Transition'),
('A_25_07', 'Family Support'),
('A_25_08', 'Military One Source'),
('A_25_09', 'TRICARE Provider'),
('A_25_10', 'VA Medical Center or Community Clinic'),
('A_25_11', 'Veterans Center'),
('A_25_12', 'Other (list):'),
('A_25_13', 'No Supplemental Services Required'),

-- Signature
('A_30_00', 'I hereby certify that this review process has been completed.'),
('A_30_01', 'Health Care Provider Digital Signature'),
('A_30_02', 'Date Completed');