# Flui3d Development Guidelines

This document provides detailed information for developers working on the Flui3d project. It includes build/configuration instructions, testing information, and additional development details.

> **Note**: This file was created as part of a documentation task to help future developers understand the project better. It doesn't modify any existing code or functionality.

## Build/Configuration Instructions

### Frontend Setup

1. **Prerequisites**:
    - Node.js (v14 or higher recommended)
    - npm (v6 or higher)

2. **Installation**:
   ```bash
   cd Frontend
   npm install
   ```

3. **Configuration**:
    - Update the backend URL in `Frontend/src/library/hardCodedValues.ts`:
      ```typescript
      const postUrl = "https://your.backend.url";
      ```

4. **Development Server**:
   ```bash
   # Standard development server
   npm run serve

   # If you encounter OpenSSL issues
   npm run start
   ```

5. **Production Build**:
   ```bash
   npm run build
   ```
   The built files will be in the `Frontend/dist` directory and can be hosted on any web server.

### Backend Setup

1. **Prerequisites**:
    - JDK (latest version recommended)
    - Apache Tomcat 11

2. **Build Process**:
    - The backend is a standard Java web application
    - Build a WAR artifact using your IDE (IntelliJ IDEA recommended) or a build tool like Maven/Gradle
    - Deploy the WAR file to Tomcat

3. **Deployment**:
    - Copy the WAR file to Tomcat's `webapps` directory
    - The application will be available at `http://localhost:8080/[war-name]`

## Testing Information

### Frontend Testing

1. **Test Framework**:
    - Jest is used for unit testing
    - Tests are written in TypeScript

2. **Running Tests**:
   ```bash
   cd Frontend
   npm test
   ```

3. **Test Structure**:
    - Test files are located in `Frontend/tests/unit`
    - Test files should follow the naming convention `*.spec.ts`
    - Each test file should correspond to a source file

4. **Writing Tests**:
    - Example test for a module (e.g., testing constants in `hardCodedValues.ts`):
      ```typescript
      import { defaultPropertyStep, layerColorDefault } from '../../src/library/hardCodedValues';
 
      describe('hardCodedValues', () => {
        test('defaultPropertyStep should be 50', () => {
          expect(defaultPropertyStep).toBe(50);
        });
 
        test('layerColorDefault should be an array with 6 colors', () => {
          expect(Array.isArray(layerColorDefault)).toBe(true);
          expect(layerColorDefault.length).toBe(6);
        });
      });
      ```

5. **Adding New Tests**:
    - Create a new test file in `Frontend/tests/unit`
    - Import the module or component you want to test
    - Write test cases using Jest's `describe` and `test` functions
    - Run the tests with `npm test`

### Backend Testing

For the backend, you can use JUnit for unit testing and integration testing:

1. **Setting Up JUnit**:
    - Add JUnit dependencies to your project
    - Create a `test` directory in the backend project

2. **Writing Tests**:
    - Create test classes that extend `junit.framework.TestCase`
    - Use assertions to verify expected behavior
    - Example test for a servlet:
      ```java
      import org.junit.Test;
      import static org.junit.Assert.*;
 
      public class HelloServletTest {
          @Test
          public void testServletResponse() {
              // Test implementation
              assertTrue(true);
          }
      }
      ```

## Additional Development Information

### Code Style

1. **Frontend**:
    - Follow the Vue.js Style Guide (Priority A rules are essential)
    - Use TypeScript for type safety
    - Use ES6+ features where appropriate
    - Use Vue's Composition API for new components

2. **Backend**:
    - Follow standard Java code conventions
    - Use meaningful variable and method names
    - Document public APIs with Javadoc comments

### Project Structure

1. **Frontend**:
    - `src/components`: Vue components
    - `src/assets`: Static assets
    - `src/library`: Utility functions and constants
    - `src/stores`: Pinia stores for state management
    - `src/lang`: Internationalization files

2. **Backend**:
    - `src/main/java`: Java source code
    - `src/main/webapp`: Web application resources

### Debugging Tips

1. **Frontend**:
    - Use Vue DevTools for debugging Vue components
    - Use browser developer tools for JavaScript debugging
    - Check the console for errors and warnings

2. **Backend**:
    - Use IDE debugging tools
    - Check Tomcat logs for errors
    - Add logging statements to track execution flow

### Performance Considerations

1. **Frontend**:
    - Minimize DOM manipulations
    - Use computed properties for derived values
    - Lazy load components when possible

2. **Backend**:
    - Optimize database queries
    - Use caching where appropriate
    - Consider thread safety for servlet operations

## Deployment

1. **Frontend**:
    - Build the frontend with `npm run build`
    - Deploy the contents of the `dist` directory to a web server

2. **Backend**:
    - Build a WAR file
    - Deploy to Tomcat or another servlet container

Remember to update the `postUrl` in the frontend to point to the deployed backend URL.