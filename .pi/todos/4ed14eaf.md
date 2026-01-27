{
  "id": "4ed14eaf",
  "title": "Demo presentation for testing",
  "tags": [
    "phase-1",
    "mvp"
  ],
  "status": "completed",
  "created_at": "2026-01-27T08:58:21.235Z",
  "assigned_to_session": "15e266e6-92ea-40e5-92d5-c905029c95ea"
}

# Demo Presentation

Create a basic HTML presentation for testing all features. This is critical for:
1. Testing the framework during development
2. Serving as an example for users
3. Exploring edge cases (build steps, etc.)

## Requirements

### Basic Structure
- Multiple slides navigable via arrow keys
- URL hash changes per slide (`#1`, `#2`, etc.)
- Clean, readable styling
- Works standalone (without framework)

### examples/basic/index.html

```html
<!DOCTYPE html>
<html>
<head>
  <title>Demo Presentation</title>
  <style>
    /* Full-screen slides */
    /* Hash-based navigation */
  </style>
</head>
<body>
  <div class="slide" id="1">
    <h1>Welcome</h1>
    <p>Press → to continue</p>
  </div>
  
  <div class="slide" id="2">
    <h1>Slide 2</h1>
    <ul>
      <li>Point one</li>
      <li>Point two</li>
    </ul>
  </div>
  
  <!-- More slides -->
  
  <script>
    // Basic arrow key navigation
    // Update hash on slide change
    // Show slide matching current hash
  </script>
</body>
</html>
```

### Features to Test
- [x] Arrow key navigation
- [x] Hash-based slide identification
- [ ] Build steps within a slide (same hash, different state)
- [ ] Optional: Implement window.miniPresenter API

## Tasks
- [ ] Create examples/basic/index.html
- [ ] Add 5-10 slides with varied content
- [ ] Implement keyboard navigation (arrows, space)
- [ ] Implement hash-based slide tracking
- [ ] Style for full-screen slides
- [ ] Add a slide with build steps to test that scenario
- [ ] Optionally add miniPresenter API for enhanced features

## Depends on
- TODO-40a1db1a (Project setup)
- Can be worked on in parallel with other phase-1 tasks
