import React, { useState } from 'react';
import {
  Box,
  Button,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  useToast,
  useColorModeValue,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const AdminLogin: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await axios.post('http://localhost:5000/api/admin/login', {
        username,
        password,
      });

      // Store the token
      localStorage.setItem('adminToken', response.data.token);

      toast({
        title: 'Login Successful',
        description: response.data.message,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Add a small delay to ensure the toast is visible
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 1000);
    } catch (error: any) {
      toast({
        title: 'Login Failed',
        description: error.response?.data?.error || 'An error occurred',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box minH="100vh" bg={useColorModeValue('gray.50', 'gray.900')} py={12}>
      <Container maxW="container.sm">
        <Box
          bg={useColorModeValue('white', 'gray.800')}
          p={8}
          rounded="lg"
          shadow="base"
        >
          <Stack spacing={6}>
            <Heading
              size="lg"
              textAlign="center"
              color={useColorModeValue('gray.700', 'white')}
            >
              Admin Login
            </Heading>

            <form onSubmit={handleSubmit}>
              <Stack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Username</FormLabel>
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Password</FormLabel>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </FormControl>

                <Button
                  type="submit"
                  colorScheme="blue"
                  size="lg"
                  fontSize="md"
                  isLoading={isLoading}
                >
                  Login
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => navigate('/')}
                  size="lg"
                  fontSize="md"
                >
                  Back to Home
                </Button>
              </Stack>
            </form>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};

export default AdminLogin; 