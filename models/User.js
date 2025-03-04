const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
  role: { type: String, enum: ['buyer', 'seller'], default: 'buyer' }
});

module.exports = mongoose.model('User', userSchema);