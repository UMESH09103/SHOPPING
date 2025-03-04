require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const User = require('./models/User');
const Shop = require('./models/Shop');

const app = express();

// MongoDB Connection
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/paithaniDB';
mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/landing');
  }
  next();
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'public/uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Routes
app.get('/', (req, res) => {
  res.redirect('/landing');
});

app.get('/landing', (req, res) => {
  res.render('landing', { message: null, messageType: null, activeForm: 'login' });
});

app.get('/shops', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    const shops = await Shop.find({}, 'name description contact image place owner'); // Fetch all shops with necessary fields
    res.render('shop', { user, shop: null, shops, allShops: shops }); // Pass 'shops' explicitly
  } catch (error) {
    console.error('Error loading shops:', error);
    res.status(500).send('Something went wrong');
  }
});

app.get('/shop/:id', requireLogin, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).populate('owner', 'username');
    if (!shop) {
      return res.status(404).send('Shop not found');
    }
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    const allShops = await Shop.find({}, 'name description contact image place');
    res.render('shop', { user, shop, allShops });
  } catch (error) {
    console.error('Error loading shop:', error);
    res.status(500).send('Something went wrong');
  }
});

app.get('/seller-shops', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    let shops;
    if (user.role === 'seller') {
      // Sellers see only their own shops
      shops = await Shop.find({ owner: user._id }).populate('owner', 'username'); // Fetch all shops owned by the user
      console.log('Seller shops:', shops); // Debug log to verify shops
    } else {
      // Buyers see all shops added by sellers
      shops = await Shop.find({}).populate('owner', 'username'); // Fetch all shops
    }
    res.render('seller-shops', { user, shops });
  } catch (error) {
    console.error('Error loading shops:', error);
    res.status(500).send('Something went wrong');
  }
});

app.get('/add-shop-form', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    if (user.role !== 'seller') {
      return res.redirect('/seller-shops'); // Redirect buyers to seller-shops (read-only)
    }
    res.render('add-shop-form', { user, error: null, values: {} });
  } catch (error) {
    console.error('Error loading add shop form:', error);
    res.status(500).send('Something went wrong');
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.render('landing', { message: 'Email and password are required', messageType: 'error', activeForm: 'login' });
    }
    const user = await User.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
      req.session.userId = user._id;
      res.redirect('/seller-shops'); // Redirect both buyers and sellers to /seller-shops
    } else {
      res.render('landing', { message: 'Invalid email or password', messageType: 'error', activeForm: 'login' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('landing', { message: 'Something went wrong', messageType: 'error', activeForm: 'login' });
  }
});

app.post('/register', async (req, res) => {
  try {
    const { username, email, password, gender, role } = req.body;
    if (!username || !email || !password || !gender || !role) {
      return res.render('landing', { message: 'All fields are required', messageType: 'error', activeForm: 'register' });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('landing', { message: 'Email already registered', messageType: 'error', activeForm: 'register' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword, gender, role });
    await user.save();
    res.render('landing', { message: 'Registration successful! Please login.', messageType: 'success', activeForm: 'login' });
  } catch (error) {
    console.error('Registration error:', error);
    res.render('landing', { message: 'Failed to register. Please try again.', messageType: 'error', activeForm: 'register' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Logout error:', err);
    res.redirect('/landing');
  });
});

app.post('/add-shop', requireLogin, upload.single('image'), async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    if (user.role !== 'seller') {
      return res.status(403).send('Only sellers can add shops');
    }
    console.log('Session userId:', req.session.userId); // Debug log for session
    console.log('Form data:', req.body);
    console.log('File data:', req.file);
    const { name, ownerName, place, description, contact, gender } = req.body;
    if (!place || !place.trim()) {
      return res.render('add-shop-form', {
        user, // Ensure user is in scope
        error: 'Place is required and cannot be empty',
        values: { name, ownerName, place: place || '', description, contact, gender: gender || '' }
      });
    }
    let imagePath = '';
    if (req.file) {
      imagePath = `/uploads/${req.file.filename}`;
    }

    // Find or create the owner based on username or email
    let owner;
    const usernameMatch = await User.findOne({ username: ownerName });
    const emailMatch = await User.findOne({ email: ownerName });
    if (usernameMatch) {
      owner = usernameMatch;
      console.log('Found owner by username:', owner._id);
    } else if (emailMatch) {
      owner = emailMatch;
      console.log('Found owner by email:', owner._id);
    } else {
      // Create a new user with a valid gender (default to 'Other' if not provided, ensuring it matches the enum)
      const validGenders = ['Male', 'Female', 'Other']; // Define valid gender values
      const newOwnerGender = gender && validGenders.includes(gender) ? gender : 'Other'; // Use 'Other' if gender is invalid or not provided
      const newOwner = new User({
        username: ownerName.split('@')[0] || 'newowner', // Simple username creation from email
        email: ownerName,
        password: await bcrypt.hash('defaultpassword', 10), // Use a default or require password input
        role: 'seller', // Assume new owner is a seller
        gender: newOwnerGender // Use valid gender
      });
      owner = await newOwner.save();
      console.log('Created new owner:', owner._id);
    }

    // Verify the owner is correctly associated with the shop and matches the logged-in user
    if (owner._id.toString() !== user._id.toString()) {
      console.warn('Warning: New shop owner does not match logged-in user. Using logged-in user as owner.');
      owner = user; // Fallback to the logged-in user as owner if mismatch occurs
    }
    console.log('Final shop owner:', owner._id);

    const shop = new Shop({
      name,
      description,
      contact,
      place,
      image: imagePath,
      owner: owner._id, // Ensure the owner is correctly linked to the logged-in seller
      products: []
    });
    await shop.save();
    console.log('New shop saved:', shop); // Debug log to verify shop creation

    res.redirect('/seller-shops');
  } catch (error) {
    console.error('Error adding shop:', error);
    const currentUser = await User.findById(req.session.userId); // Fetch user in catch block
    res.render('add-shop-form', {
      user: currentUser, // Use fetched user
      error: error.message || 'Failed to add shop. Please try again.',
      values: req.body
    });
  }
});

app.get('/edit-shop/:id', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    if (user.role !== 'seller') {
      return res.redirect('/seller-shops'); // Redirect buyers to seller-shops (read-only)
    }
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).send('Shop not found');
    }
    if (shop.owner.toString() !== user._id.toString()) {
      return res.status(403).send('You can only edit your own shops');
    }
    res.render('edit-shop', { user, shop, error: null });
  } catch (error) {
    console.error('Error loading edit shop form:', error);
    res.status(500).send('Something went wrong');
  }
});

app.post('/edit-shop/:id', requireLogin, upload.single('image'), async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    if (user.role !== 'seller') {
      return res.status(403).send('Only sellers can edit shops');
    }
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).send('Shop not found');
    }
    if (shop.owner.toString() !== user._id.toString()) {
      return res.status(403).send('You can only edit your own shops');
    }

    const { name, description, contact, place } = req.body;
    if (!name || !place || !contact) {
      return res.render('edit-shop', {
        user,
        shop,
        error: 'Name, place, and contact are required fields'
      });
    }

    shop.name = name;
    shop.description = description || '';
    shop.contact = contact;
    shop.place = place;

    if (req.file) {
      if (shop.image) {
        const oldImagePath = path.join(__dirname, 'public', shop.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      shop.image = `/uploads/${req.file.filename}`;
    }

    await shop.save();
    res.redirect('/seller-shops');
  } catch (error) {
    console.error('Error updating shop:', error);
    res.render('edit-shop', {
      user,
      shop,
      error: 'Failed to update shop. Please try again.'
    });
  }
});

app.get('/shop-full/:id', requireLogin, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).send('Shop not found');
    }
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    res.render('shop-full', { shop, user });
  } catch (error) {
    console.error('Error loading full shop page:', error);
    res.status(500).send('Something went wrong');
  }
});

app.post('/add-product/:shopId', requireLogin, upload.array('images', 5), async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    if (user.role !== 'seller') {
      return res.status(403).send('Only sellers can add products');
    }
    const shop = await Shop.findById(req.params.shopId);
    if (!shop) {
      return res.status(404).send('Shop not found');
    }
    if (shop.owner.toString() !== user._id.toString()) {
      return res.status(403).send('You can only add products to your own shops');
    }

    const { name, price, description } = req.body;
    if (!name || !price) {
      return res.redirect(`/shop-full/${req.params.shopId}`); // Redirect back with no error handling for simplicity
    }

    const images = req.files.map(file => `/uploads/${file.filename}`).slice(0, 5); // Limit to 5 images

    const product = {
      name,
      price: parseFloat(price),
      images: images, // Store multiple images as an array
      description: description || '' // Optional description
    };

    shop.products.push(product);
    await shop.save();
    res.redirect(`/shop-full/${req.params.shopId}`); // Redirect back to shop-full for consistency
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).send('Failed to add product');
  }
});

app.get('/edit-product/:id', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    if (user.role !== 'seller') {
      return res.redirect('/shop-full/' + req.params.id); // Redirect buyers to shop-full (read-only)
    }

    // Find the shop containing this product
    const shop = await Shop.findOne({ 'products._id': req.params.id });
    if (!shop) {
      return res.status(404).send('Product not found');
    }

    // Find the specific product within the shop's products array
    const product = shop.products.id(req.params.id);
    if (!product) {
      return res.status(404).send('Product not found');
    }

    if (shop.owner.toString() !== user._id.toString()) {
      return res.status(403).send('You can only edit your own products');
    }

    res.render('edit-product', { user, shop, product, error: null });
  } catch (error) {
    console.error('Error loading edit product form:', error);
    res.status(500).send('Something went wrong');
  }
});

app.post('/edit-product/:id', requireLogin, upload.array('images', 5), async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    if (user.role !== 'seller') {
      return res.status(403).send('Only sellers can edit products');
    }

    // Find the shop containing this product
    const shop = await Shop.findOne({ 'products._id': req.params.id });
    if (!shop) {
      return res.status(404).send('Product not found');
    }

    // Find the specific product within the shop's products array
    const product = shop.products.id(req.params.id);
    if (!product) {
      return res.status(404).send('Product not found');
    }

    if (shop.owner.toString() !== user._id.toString()) {
      return res.status(403).send('You can only edit your own products');
    }

    const { name, price, description } = req.body;
    if (!name || !price) {
      return res.render('edit-product', {
        user,
        shop,
        product,
        error: 'Name and price are required fields'
      });
    }

    product.name = name;
    product.price = parseFloat(price);
    product.description = description || '';

    if (req.files && req.files.length > 0) {
      // Delete old images if they exist
      if (product.images && product.images.length > 0) {
        product.images.forEach(image => {
          const imagePath = path.join(__dirname, 'public', image);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        });
      }
      // Add new images (up to 5)
      product.images = req.files.map(file => `/uploads/${file.filename}`).slice(0, 5);
    }

    await shop.save();
    res.redirect(`/shop-full/${shop._id}`);
  } catch (error) {
    console.error('Error updating product:', error);
    res.render('edit-product', {
      user,
      shop,
      product,
      error: 'Failed to update product. Please try again.'
    });
  }
});

app.get('/delete-product/:shopId/:productId', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    if (user.role !== 'seller') {
      return res.status(403).send('Only sellers can delete products');
    }

    const shop = await Shop.findById(req.params.shopId);
    if (!shop) {
      return res.status(404).send('Shop not found');
    }

    if (shop.owner.toString() !== user._id.toString()) {
      return res.status(403).send('You can only delete your own products');
    }

    // Find and remove the specific product
    const productIndex = shop.products.findIndex(product => product._id.toString() === req.params.productId);
    if (productIndex === -1) {
      return res.status(404).send('Product not found');
    }

    // Delete product images if they exist
    const product = shop.products[productIndex];
    if (product.images && product.images.length > 0) {
      product.images.forEach(image => {
        const imagePath = path.join(__dirname, 'public', image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      });
    }

    // Remove the product from the products array
    shop.products.splice(productIndex, 1);
    await shop.save();
    res.redirect(`/shop-full/${shop._id}`);
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).send('Failed to delete product. Please try again.');
  }
});

app.get('/delete-shop/:id', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    if (user.role !== 'seller') {
      return res.status(403).send('Only sellers can delete shops');
    }
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).send('Shop not found');
    }
    if (shop.owner.toString() !== user._id.toString()) {
      return res.status(403).send('You can only delete your own shops');
    }

    // Delete the shop image file if it exists
    if (shop.image) {
      const imagePath = path.join(__dirname, 'public', shop.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Delete all product images if they exist
    shop.products.forEach(product => {
      if (product.images && product.images.length > 0) {
        product.images.forEach(image => {
          const imagePath = path.join(__dirname, 'public', image);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        });
      }
    });

    // Delete the shop from the database
    await Shop.findByIdAndDelete(req.params.id);
    res.redirect('/seller-shops');
  } catch (error) {
    console.error('Error deleting shop:', error);
    res.status(500).send('Failed to delete shop. Please try again.');
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});