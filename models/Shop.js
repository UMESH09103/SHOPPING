const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  name: String,
  description: String,
  contact: String,
  place: String,
  image: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  products: [{
    _id: mongoose.Schema.Types.ObjectId,
    name: String,
    price: Number,
    images: [String], // Array of image paths for multiple images (up to 5)
    description: String // Optional description
  }]
});

module.exports = mongoose.model('Shop', shopSchema);