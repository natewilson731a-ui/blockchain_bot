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
  Text,
  useToast,
  useColorModeValue,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  PinInput,
  PinInputField,
  HStack,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const UserRegistration: React.FC = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    cnic: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const navigate = useNavigate();
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: 'Password Mismatch',
        description: 'Passwords do not match',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
    if (!cnicRegex.test(formData.cnic)) {
      toast({
        title: 'Invalid CNIC',
        description: 'Please enter a valid CNIC in the format: 12345-1234567-1',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsLoading(true);

    try {
      await axios.post('http://localhost:5000/api/user/register', formData);
      setIsOtpModalOpen(true);
    } catch (error: any) {
      toast({
        title: 'Registration Failed',
        description: error.response?.data?.error || 'An error occurred',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async () => {
    try {
      await axios.post('http://localhost:5000/api/user/verify-otp', {
        email: formData.email,
        otp,
      });

      toast({
        title: 'Registration Successful',
        description: 'Your account has been created successfully. Please login to continue.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      navigate('/user/login');
    } catch (error: any) {
      toast({
        title: 'Verification Failed',
        description: error.response?.data?.error || 'An error occurred',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  return (
    <Box minH="100vh" bg={useColorModeValue('gray.50', 'gray.900')} py={12}>
      <Container maxW="container.md">
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
              Create Your Account
            </Heading>

            <Text textAlign="center" color={useColorModeValue('gray.600', 'gray.400')}>
              Create an account to get started. After registration, you can register as a voter.
            </Text>

            <form onSubmit={handleSubmit}>
              <Stack spacing={4}>
                <Stack direction={{ base: 'column', md: 'row' }} spacing={4}>
                  <FormControl isRequired>
                    <FormLabel>First Name</FormLabel>
                    <Input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) =>
                        setFormData({ ...formData, firstName: e.target.value })
                      }
                      placeholder="Enter your first name"
                    />
                  </FormControl>

                  <FormControl isRequired>
                    <FormLabel>Last Name</FormLabel>
                    <Input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) =>
                        setFormData({ ...formData, lastName: e.target.value })
                      }
                      placeholder="Enter your last name"
                    />
                  </FormControl>
                </Stack>

                <FormControl isRequired>
                  <FormLabel>Email</FormLabel>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="Enter your email"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>CNIC</FormLabel>
                  <Input
                    type="text"
                    value={formData.cnic}
                    onChange={(e) =>
                      setFormData({ ...formData, cnic: e.target.value })
                    }
                    placeholder="Enter your CNIC (e.g., 12345-1234567-1)"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Password</FormLabel>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder="Enter your password"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Confirm Password</FormLabel>
                  <Input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({ ...formData, confirmPassword: e.target.value })
                    }
                    placeholder="Confirm your password"
                  />
                </FormControl>

                <Button
                  type="submit"
                  colorScheme="blue"
                  size="lg"
                  fontSize="md"
                  isLoading={isLoading}
                >
                  Create Account
                </Button>
              </Stack>
            </form>

            <Text textAlign="center" color={useColorModeValue('gray.600', 'gray.400')}>
              Already have an account?{' '}
              <Button
                variant="link"
                color="blue.400"
                onClick={() => navigate('/user/login')}
              >
                Login here
              </Button>
            </Text>
          </Stack>
        </Box>
      </Container>

      <Modal isOpen={isOtpModalOpen} onClose={() => setIsOtpModalOpen(false)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Verify Your Email</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Stack spacing={4}>
              <Text>Please enter the verification code sent to your email.</Text>
              <HStack justifyContent="center">
                <PinInput otp value={otp} onChange={setOtp}>
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                </PinInput>
              </HStack>
              <Button
                colorScheme="blue"
                onClick={handleOtpSubmit}
                isLoading={isLoading}
              >
                Verify
              </Button>
            </Stack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default UserRegistration; 