var Student = {
  // please fill in your name and NetID
  // your NetID is the part of your email before @yale.edu
  name: "Enoch Omale, Jarred Parr",
  netID: "eo329, jp2844",
};

Student.updateHTML = function () {
  var studentInfo = this.name + " &lt;" + this.netID + "&gt;";
  document.getElementById("student").innerHTML = studentInfo;
};
