from faker import Faker
import random
import datetime
import mssql_python

# connect to db
connString = "SERVER=localhost;DATABASE=master;UID=sa;PWD=3939;Encrypt=no;Trusted_Connection=yes;"
connection = mssql_python.connect(connString)
cursor = connection.cursor()

# TODO: Make arrays for columns to be inserted
lname = []
fname = []
mi = []
dodid = []
d_event = []
dob = []
sex = []
form_service = []
service_other = []
form_component = []
grade = []
grade_other = []
unit_name = []
unit_loc = []
phone = []
cell = []
dsn = []
email = []

# TODO: Add random data to database
fake = Faker()
Faker.seed(39)

for _ in range(100):
    lname.append("'" + str(fake.unique.last_name()) + "'")
    fname.append("'" + str(fake.unique.first_name()) + "'")
    mi.append("'" + str(random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")) + "'")
    dodid.append("'" + str(fake.unique.bothify(text="0000000###")) + "'")
    d_event.append("'" + str(fake.date_between(start_date="-2y", end_date="today").strftime("%Y%m%d")) + "'")
    dob.append("'" + str(fake.date_of_birth(minimum_age=18, maximum_age=65).strftime("%Y%m%d")) + "'")
    sex.append("'" + str(random.choice(["M", "F", "X"])) + "'")
    form_service.append("'" + str(random.choice(["A", "C", "D", "F", "M", "N", "P", "X"])) + "'")
    service_other.append("null")
    form_component.append("'" + str(random.choice(["A", "N", "R", "X"])) + "'")
    grade.append("'" + str(random.choice(['E01','E02','E03','E04','E05','E06','E07','E08','E09','O01','O02','O03','O04','O05','O06','O07','O08','O09','O10','W01','W02','W03','W04','W05','ZZZ'])) + "'")
    grade_other.append("null")
    unit_name.append("null")
    unit_loc.append("null")
    phone.append("'" + str(fake.unique.bothify(text="##########")) + "'")
    cell.append("'" + str(fake.unique.bothify(text="##########")) + "'")
    dsn.append("null")
    email.append("'" + str(fake.unique.email()) + "'")

# TODO insert data
for _ in range(100):
    person = [str(lname.pop()), str(fname.pop()), str(mi.pop()), str(dodid.pop()), str(d_event.pop()), str(dob.pop()), str(sex.pop()), str(form_service.pop()), str(service_other.pop()), str(form_component.pop()), str(grade.pop()), str(grade_other.pop()), str(unit_name.pop()), str(unit_loc.pop()), str(phone.pop()), str(cell.pop()), str(dsn.pop()), str(email.pop())]

    person_statement = ", ".join(person)

    insert_query = "INSERT INTO dd2795_pre_response (lname, fname, mi, dodid, d_event, dob, sex, form_service, service_other, form_component, grade, grade_other, unit_name, unit_loc, phone, cell, dsn, email) VALUES (" + person_statement + ");"

    cursor.execute(insert_query)
connection.commit()
cursor.close()